import express from 'express';
import cors from 'cors';
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, getContentType, downloadMediaMessage } from '@whiskeysockets/baileys';

const app = express();
app.use(cors());
app.use(express.json());

if (!fs.existsSync('media')) fs.mkdirSync('media');
app.use('/media', express.static('media'));

let nextCompanyId = 1;
let nextAccountId = 1;
const users = [{ id: 1, username: 'admin', password: 'admin', role: 'admin' }];
const companies = [];
const accounts = [];
const sessions = {};

function generateToken() { return crypto.randomBytes(16).toString('hex'); }
const JWT_SECRET = 'RaelFlowSecretKey';
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

app.post('/companies', authMiddleware, (req, res) => {
  const { name, maxWhatsApp } = req.body;
  const company = { id: nextCompanyId++, name, maxWhatsApp: maxWhatsApp || 1 };
  companies.push(company);
  res.json(company);
});

app.get('/companies', authMiddleware, (req, res) => {
  res.json(companies);
});

app.get('/companies/:companyId/accounts', authMiddleware, (req, res) => {
  const companyId = parseInt(req.params.companyId);
  const company = companies.find(c => c.id === companyId);
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });
  const companyAccounts = accounts.filter(acc => acc.companyId === companyId);
  const result = companyAccounts.map(acc => ({
    id: acc.id,
    phone: acc.phone || null,
    token: acc.token,
    webhooks: acc.webhooks
  }));
  res.json({ company: company.name, companyId: company.id, accounts: result });
});

async function startWhatsAppSession(account) {
  const accountId = account.id;
  const sessionPath = `./sessions/session-${accountId}`;
  os.makedirs = os.makedirs if False else None  # dummy to avoid IDE warnings
  import os as _os; _os.makedirs('./sessions', exist_ok=True)
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false });
  sessions[accountId] = { sock, isConnected: false, phoneJid: null, qr: null };
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) sessions[accountId].qr = qr;
    if (connection === 'open') {
      sessions[accountId].isConnected = true;
      if (sock.user?.id) {
        sessions[accountId].phoneJid = sock.user.id;
        account.phone = sock.user.id;
      }
    }
    if (connection === 'close') {
      sessions[accountId].isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode && statusCode !== 401;
      if (shouldReconnect) startWhatsAppSession(account);
    }
  });
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const senderJid = msg.key.remoteJid;
        const contentType = getContentType(msg.message);
        let text = '', mediaFileName = null, mediaType = null;
        if (contentType === 'conversation') {
          text = msg.message.conversation;
        } else if (contentType === 'extendedTextMessage') {
          text = msg.message.extendedTextMessage.text || '';
        } else if (['imageMessage','videoMessage','documentMessage','audioMessage','stickerMessage'].includes(contentType)) {
          mediaType = contentType.replace('Message','');
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            let ext = '';
            const mime = msg.message[contentType]?.mimetype;
            if (mime) {
              if (mime.includes('image/jpeg')||mime.includes('image/png')) ext = mime.includes('png')?'.png':'.jpg';
              else if (mime.includes('video')) ext = '.mp4';
              else if (mime.includes('audio/ogg')) ext = '.ogg';
              else if (mime.includes('pdf')) ext = '.pdf';
            }
            if (!ext && msg.message[contentType]?.fileName) {
              const fn = msg.message[contentType].fileName;
              const dot = fn.lastIndexOf('.');
              if (dot >= 0) ext = fn.substring(dot);
            }
            if (!ext) ext = '.bin';
            mediaFileName = `msg-${accountId}-${Date.now()}${ext}`;
            fs.writeFileSync(`media/${mediaFileName}`, buffer);
          } catch (err) { console.error('Erro ao baixar mídia:', err); }
          const caption = msg.message[contentType]?.caption;
          if (caption) text = caption;
        }
        const payload = {
          accountId: accountId, from: senderJid, timestamp: msg.messageTimestamp,
          text: text, mediaType: mediaType,
          mediaUrl: mediaFileName ? `${req.protocol}://${req.get('host')}/media/${mediaFileName}` : null
        };
        for (const url of account.webhooks) {
          axios.post(url, payload).catch(err => console.error(`Webhook failed ${url}:`, err.message));
        }
      }
    }
  });
}

app.post('/companies/:companyId/accounts', authMiddleware, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  const company = companies.find(c => c.id === companyId);
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });
  const companyAccounts = accounts.filter(acc => acc.companyId === companyId);
  if (companyAccounts.length >= company.maxWhatsApp) {
    return res.status(400).json({ error: 'Limite de WhatsApp Web atingido' });
  }
  const newAccount = { id: nextAccountId++, companyId, token: generateToken(), phone: null, webhooks: [] };
  accounts.push(newAccount);
  try {
    await startWhatsAppSession(newAccount);
    setTimeout(() => {
      const qr = sessions[newAccount.id]?.qr;
      res.json({ accountId: newAccount.id, qr: qr || null });
    }, 1000);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha ao iniciar sessão' });
  }
});

app.post('/accounts/:accountId/generate-token', authMiddleware, (req, res) => {
  const accountId = parseInt(req.params.accountId);
  const account = accounts.find(acc => acc.id === accountId);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  account.token = generateToken();
  res.json({ accountId: account.id, newToken: account.token });
});

app.post('/accounts/:accountId/webhooks', authMiddleware, (req, res) => {
  const accountId = parseInt(req.params.accountId);
  const { url } = req.body;
  const account = accounts.find(acc => acc.id === accountId);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  if (!account.webhooks.includes(url)) account.webhooks.push(url);
  res.json({ webhooks: account.webhooks });
});

app.delete('/accounts/:accountId/webhooks', authMiddleware, (req, res) => {
  const accountId = parseInt(req.params.accountId);
  const { url } = req.body;
  const account = accounts.find(acc => acc.id === accountId);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  account.webhooks = account.webhooks.filter(u => u !== url);
  res.json({ webhooks: account.webhooks });
});

app.post('/api/send', async (req, res) => {
  const { token, to, message, mediaBase64, mediaType, fileName, caption } = req.body;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  const account = accounts.find(acc => acc.token === token);
  if (!account) return res.status(401).json({ error: 'Token inválido' });
  const session = sessions[account.id];
  if (!session || !session.sock) return res.status(500).json({ error: 'Sessão indisponível' });
  const sock = session.sock;
  let jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  try {
    if (mediaBase64 and mediaType):
      // omitted for brevity
      pass
    elif message:
      await sock.sendMessage(jid, { text: message });
    else:
      return res.status(400).json({ error: 'Nenhuma mensagem ou mídia' });
    res.json({ status: 'OK' });
  except Exception as err:
    console.error('Erro no envio:', err);
    res.status(500).json({ error: 'Falha no envio' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend na porta ${PORT}`));
