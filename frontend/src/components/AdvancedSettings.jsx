import React, { useState, useEffect } from 'react';

const AdvancedSettings = ({ serverUrlProp, login1c, password1c, n8n }) => {
  const [serverUrl, setServerUrl] = useState(serverUrlProp || '');
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [pingStatus, setPingStatus] = useState('idle');

  // Формируем чистый URL прокси
  const proxyUrl = (() => {
    let base = n8n || 'n8n.24tema.ru';
    if (!base.startsWith('http')) base = `https://${base}`;
    return `${base.replace(/\/$/, '')}/webhook/1c-proxy`;
  })();

  // Функция для формирования заголовков авторизации
  const getAuthHeaders = () => {
    const headers = { 'Accept': 'application/json' };
    if (login1c && password1c) {
      headers['Authorization'] = `Basic ${btoa(login1c + ':' + password1c)}`;
    }
    return headers;
  };

  // Фолбэк: если serverUrlProp пустой (например, виджет только установили), пытаемся достать из AMOCRM.widgets
  useEffect(() => {
    if (!serverUrl) {
      try {
        if (window.AMOCRM && window.AMOCRM.widgets && window.AMOCRM.widgets.list) {
          const widgets = window.AMOCRM.widgets.list;
          for (const key in widgets) {
            if (widgets[key].params && widgets[key].params.server_url) {
              setServerUrl(widgets[key].params.server_url);
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Не удалось автоматически получить server_url");
      }
    }
  }, [serverUrl]);

  // --- 1. ПИНГ СЕРВЕРА ---
  const handlePing = async () => {
    if (!serverUrl) return alert('Пожалуйста, укажите URL сервера.');
    
    setPingStatus('loading');
    try {
      const cleanUrl = serverUrl.replace(/\/$/, '');
      const targetUrl = `${cleanUrl}/hs/integration/ping`;

      const res = await fetch(proxyUrl, { 
        method: 'GET',
        headers: {
          ...getAuthHeaders(),
          'X-1C-Url': targetUrl
        }
      });
      
      if (res.ok) {
        setPingStatus('ok');
      } else {
        setPingStatus('error');
      }
    } catch (error) {
      setPingStatus('error');
    }
  };

  // --- 2. ПОЛУЧЕНИЕ ЛОГОВ ---
  const fetchLogs = async () => {
    if (!serverUrl) return alert('Пожалуйста, укажите URL сервера.');
    
    setIsLoadingLogs(true);
    try {
      const cleanUrl = serverUrl.replace(/\/$/, '');
      const targetUrl = `${cleanUrl}/hs/integration/api/logs`;

      const res = await fetch(proxyUrl, { 
        method: 'GET',
        headers: {
          ...getAuthHeaders(),
          'X-1C-Url': targetUrl
        }
      });
      
      if (res.ok) {
        const text = await res.text();
        try {
          const jsonData = JSON.parse(text);
          if (Array.isArray(jsonData)) {
            setLogs(jsonData);
          } else {
            setLogs([{ time: new Date().toLocaleTimeString(), level: 'INFO', msg: text }]);
          }
        } catch (e) {
          const textLines = text.split('\n').filter(line => line.trim() !== '');
          setLogs(textLines.map(line => ({ time: new Date().toLocaleTimeString(), level: 'LOG', msg: line })));
        }
      } else {
        setLogs([{ time: new Date().toLocaleTimeString(), level: 'ERROR', color: '#e74c3c', msg: `Ошибка сервера: ${res.status}` }]);
      }
    } catch (error) {
      setLogs([{ time: new Date().toLocaleTimeString(), level: 'ERROR', color: '#e74c3c', msg: `Ошибка сети при запросе логов: ${error.message}` }]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // --- 3. СКАЧИВАНИЕ ЛОГОВ ---
  const downloadLogs = () => {
    if (logs.length === 0) return alert('Нет логов для скачивания. Сначала запросите их с сервера.');

    const logText = logs.map(l => {
      const timeStr = l.time ? `[${l.time}] ` : '';
      const levelStr = l.level ? `${l.level}: ` : '';
      const msgStr = l.msg || JSON.stringify(l);
      return `${timeStr}${levelStr}${msgStr}`;
    }).join('\n');

    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '30px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ marginBottom: '20px', color: '#333' }}>Мониторинг интеграции 1С</h1>

      {/* Панель управления */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e1e1e1', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end' }}>
        
        <div style={{ flex: '1 1 300px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#666', fontWeight: 'bold' }}>URL Сервера (API)</label>
          <input 
            type="text" 
            value={serverUrl} 
            onChange={(e) => setServerUrl(e.target.value)} 
            placeholder="https://your-server.ru"
            style={{ width: '100%', padding: '10px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handlePing} 
            disabled={pingStatus === 'loading'}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#f8f9fa', border: '1px solid #d4d5d8', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#333' }}
          >
            Пинг /ping
            {pingStatus === 'ok' && <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#32c861', display: 'inline-block' }}></span>}
            {pingStatus === 'error' && <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#e74c3c', display: 'inline-block' }}></span>}
            {pingStatus === 'loading' && <span style={{ color: '#999', fontSize: '12px' }}>...</span>}
          </button>

          <button 
            onClick={fetchLogs} 
            disabled={isLoadingLogs}
            style={{ padding: '10px 20px', backgroundColor: '#4c8bf7', border: 'none', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isLoadingLogs ? 'Загрузка...' : 'Запросить логи'}
          </button>

          <button 
            onClick={downloadLogs} 
            style={{ padding: '10px 20px', backgroundColor: '#fff', border: '1px solid #4c8bf7', color: '#4c8bf7', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Скачать .txt
          </button>
        </div>
      </div>

      {/* Терминал логов */}
      <div style={{ 
        backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '20px', 
        borderRadius: '8px', minHeight: '400px', fontFamily: 'Consolas, monospace',
        fontSize: '13px', lineHeight: '1.6', overflowY: 'auto', maxHeight: '600px',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '15px' }}>
          <span style={{ color: '#888' }}>Логи системы</span>
          <span style={{ color: pingStatus === 'ok' ? '#32c861' : '#888' }}>
            {pingStatus === 'ok' ? '● Online' : '○ Offline / Unknown'}
          </span>
        </div>

        {logs.length === 0 && !isLoadingLogs && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>Нажмите "Запросить логи", чтобы получить данные с сервера...</div>
        )}

        {logs.map((log, index) => (
          <div key={index} style={{ marginBottom: '6px', display: 'flex', gap: '15px' }}>
            {log.time && <span style={{ color: '#888', minWidth: '70px' }}>[{log.time}]</span>}
            {log.level && <span style={{ color: log.color || (log.level === 'ERROR' ? '#e74c3c' : '#4c8bf7'), fontWeight: 'bold', minWidth: '70px' }}>{log.level}</span>}
            <span style={{ color: log.level === 'WARNING' ? '#f1c40f' : (log.level === 'ERROR' ? '#e74c3c' : '#d4d4d4'), wordBreak: 'break-word' }}>
              {log.msg || JSON.stringify(log)}
            </span>
          </div>
        ))}
        
        <div style={{ marginTop: '15px', color: '#888', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="blink-cursor">_</span>
        </div>
        
        <style>{`
          .blink-cursor { animation: blink 1s step-start 0s infinite; font-weight: bold; color: #32c861; }
          @keyframes blink { 50% { opacity: 0; } }
        `}</style>
      </div>
    </div>
  );
};

export default AdvancedSettings;