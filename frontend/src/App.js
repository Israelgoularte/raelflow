import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = '/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState([]);
  const [newName, setNewName] = useState('');
  const [newMax, setNewMax] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) fetchCompanies();
  }, [token]);

  const login = async () => {
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
      localStorage.setItem('token', res.data.token);
      setToken(res.data.token);
      setError('');
    } catch {
      setError('Credenciais inválidas');
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(`${API_BASE}/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompanies(res.data);
    } catch {
      setError('Não foi possível carregar empresas');
    }
  };

  const addCompany = async () => {
    try {
      const res = await axios.post(`${API_BASE}/companies`,
        { name: newName, maxWhatsApp: newMax },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCompanies([...companies, res.data]);
      setNewName(''); setNewMax(1); setError('');
    } catch {
      setError('Falha ao criar empresa');
    }
  };

  if (!token) {
    return (
      <div className="login-container">
        <h1>Raelflow Admin Login</h1>
        {error && <p className="error">{error}</p>}
        <input placeholder="Admin" value={username} onChange={e => setUsername(e.target.value)} />
        <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
        <button onClick={login}>Entrar</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1>Empresas</h1>
      {error && <p className="error">{error}</p>}
      <div className="new-company">
        <input placeholder="Nome da empresa" value={newName} onChange={e => setNewName(e.target.value)} />
        <input type="number" min="1" value={newMax} onChange={e => setNewMax(parseInt(e.target.value))} />
        <button onClick={addCompany}>Adicionar</button>
      </div>
      <ul className="company-list">
        {companies.map(c => (
          <li key={c.id}>
            <strong>{c.name}</strong> (max WhatsApps: {c.maxWhatsApp})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
