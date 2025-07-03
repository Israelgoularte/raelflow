import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  getContentType,
  downloadMediaMessage
} from '@whiskeysockets/baileys';

const app = express();
app.use(cors());
app.use(express.json());

// Pastas de mídia e sessões
const mediaDir = path.resolve('media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir);
const sessionsDir = path.resolve('sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);
app.use('/media', express.static(mediaDir));

let nextCompanyId = 1;
let nextAccountId = 1;
const users = [{ id: 1, username: 'admin', password: 'admin', role: 'admin' }];
const companies = [];
const accounts = [];
const sessions = {};

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}
const JWT_SECRET = process.env.JWT_SECRET || 'RaelFlowSecretKey';

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Login admin
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// CRUD empresas
app.post('/companies', authMiddleware, (req, res) => {
  const { name, maxWhatsApp } = req.body;
  const company = { id: nextCompanyId++, name, maxWhatsApp: maxWhatsApp || 1 };
  companies.push(company);
  res.json(company);
});
app.get('/companies', authMiddleware, (req, res) => {
  res.json(companies);
});

// Contas por empresa
app.get('/companies/:companyId/accounts', authMiddleware, (req, res) => {
  const cid = parseInt(req.params.companyId, 10);
  const company = companies.find(c => c.id === cid);
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });
  const result = accounts
    .filter(a => a.companyId === cid)
    .map(a => ({ id: a.id, phone: a.phone, token: a.token, webhooks: a.webhooks }));
  res.json({ company: company.name, companyId: cid, accounts: result });
});

// Inicia sessão WhatsApp
async function startWhatsAppSession(account) {
  const sessionPath = path.join(sessionsDir, `session-${account.id}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false });
  sessions[account.id] = { sock, isConnected: false, phoneJid: null, qr: null };
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', update => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) sessions[account.id].qr = qr;
    if (connection === 'open') {
      sessions[account.id].isConnected = true;
      if (sock.user?.id) {
        account.phone = sock.user.id;
      }
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code && code !== 401) startWhatsAppSession(account);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const ct = getContentType(msg.message);
      let text = '';
      let mediaFile = null;
      let mediaType = null;

      if (ct === 'conversation')
        text = msg.message.conversation;
      else if (ct === 'extendedTextMessage')
        text = msg.message.extendedTextMessage.text || '';
      else if (['imageMessage','videoMessage','documentMessage','audioMessage','stickerMessage'].includes(ct)) {
        mediaType = ct.replace('Message','');
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        const mime = msg.message[ct]?.mimetype || '';
        let ext = mime.includes('png')?'.png':mime.includes('jpg')?'.jpg':mime.includes('mp4')?'.mp4':mime.includes('ogg')?'.ogg':mime.includes('pdf')?'.pdf':'';
        if (!ext) ext = path.extname(msg.message[ct]?.fileName||'') || '.bin';
        mediaFile = `msg-${account.id}-${Date.now()}${ext}`;
        fs.writeFileSync(path.join(mediaDir, mediaFile), buffer);
        text = msg.message[ct]?.caption || '';
      }

      const payload = {
        accountId: account.id,
        from: msg.key.remoteJid,
        timestamp: msg.messageTimestamp,
        text,
        mediaType,
        mediaFile
      };
      for (const url of account.webhooks) {
        axios.post(url, payload).catch(() => {});
      }
    }
  });
}

// Cria conta WhatsApp
app.post('/companies/:companyId/accounts', authMiddleware, async (req, res) => {
  const cid = parseInt(req.params.companyId, 10);
  const company = companies.find(c => c.id === cid);
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });
  if (accounts.filter(a => a.companyId === cid).length >= company.maxWhatsApp)
    return res.status(400).json({ error: 'Limite de WhatsApp Web atingido' });

  const acc = { id: nextAccountId++, companyId: cid, token: generateToken(), phone: null, webhooks: [] };
  accounts.push(acc);
  try {
    await startWhatsAppSession(acc);
    setTimeout(() => {
      res.json({ accountId: acc.id, qr: sessions[acc.id]?.qr || null });
    }, 1000);
  } catch {
    res.status(500).json({ error: 'Falha ao iniciar sessão' });
  }
});

// Token e webhooks
app.post('/accounts/:accountId/generate-token', authMiddleware, (req, res) => {
  const acc = accounts.find(a => a.id===+req.params.accountId);
  if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
  acc.token = generateToken();
  res.json({ accountId: acc.id, newToken: acc.token });
});
app.post('/accounts/:accountId/webhooks', authMiddleware, (req, res) => {
  const acc = accounts.find(a=>a.id===+req.params.accountId);
  if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
  if (!acc.webhooks.includes(req.body.url)) acc.webhooks.push(req.body.url);
  res.json({ webhooks: acc.webhooks });
});
app.delete('/accounts/:accountId/webhooks', authMiddleware, (req, res) => {
  const acc = accounts.find(a=>a.id===+req.params.accountId);
  if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
  acc.webhooks = acc.webhooks.filter(u=>u!==req.body.url);
  res.json({ webhooks: acc.webhooks });
});

// Envio de mensagens
app.post('/api/send', async (req, res) => {
  const { token, to, message, mediaBase64, mediaType, fileName, caption } = req.body;
  const acc = accounts.find(a=>a.token===token);
  if (!acc) return res.status(401).json({ error: 'Token inválido' });
  const session = sessions[acc.id]?.sock;
  if (!session) return res.status(500).json({ error: 'Sessão indisponível' });

  const jid = to.includes('@')? to:`${to}@s.whatsapp.net`;
  try {
    if (mediaBase64 && mediaType) {
      const data = mediaBase64.split(',').pop();
      const buf = Buffer.from(data, 'base64');
      const content = {};
      if (mediaType.startsWith('image')) content.image = buf;
      else if (mediaType.startsWith('video')) content.video = buf;
      else if (mediaType.startsWith('audio')) content.audio = buf;
      else { content.document = buf; content.mimetype = mediaType; content.fileName = fileName; }
      if (caption) content.caption = caption;
      await session.sendMessage(jid, content);
    } else if (message) {
      await session.sendMessage(jid, { text: message });
    } else {
      return res.status(400).json({ error: 'Nenhuma mensagem ou mídia' });
    }
    res.json({ status: 'OK' });
  } catch {
    res.status(500).json({ error: 'Falha no envio' });
  }
});

const PORT = +process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
