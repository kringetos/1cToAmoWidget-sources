import React, { useState, useEffect, useRef } from 'react';

const formatDocDate = (isoString) => {
  if (!isoString) return '';
  try {
    const [datePart, timePart] = isoString.split('T');
    const [year, month, day] = datePart.split('-');
    const timeClean = timePart ? timePart.slice(0, 5) : '';
    return `${day}.${month}.${year}` + (timeClean ? ` ${timeClean}` : '');
  } catch (e) {
    return isoString;
  }
};

const parse1CError = (rawText) => {
  try {
    const parsed = JSON.parse(rawText);
    
    if (Array.isArray(parsed) && parsed[0]?.error?.message) {
      const n8nMsg = parsed[0].error.message;
      
      const match = n8nMsg.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const innerStr = match[0]
            .replace(/\\"/g, '"') 
            .replace(/\\r\\n/g, '') 
            .replace(/\\n/g, '');
          const innerJson = JSON.parse(innerStr);
          if (innerJson.error) return innerJson.error; 
        } catch (e) {}
      }
      return n8nMsg;
    }
    
    if (parsed.error) return parsed.error;
    
  } catch (e) {}
  
  return rawText;
};

const ProductSearch = ({ serverUrl, getAuthHeaders, onSelect, proxyUrl }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchTimeoutRef = useRef(null);

  const handleSearch = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) { setResults([]); setIsOpen(false); return; }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const cleanUrl = serverUrl.replace(/\/$/, '');
        const targetUrl = `${cleanUrl}/hs/integration/v1/nomenclature?search=${encodeURIComponent(val)}`;
        
        const res = await fetch(proxyUrl, { 
          method: 'GET',
          headers: { 
            ...getAuthHeaders(),
            'X-1C-Url': targetUrl
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data) ? data : []);
          setIsOpen(true);
        }
      } catch (err) { console.error(err); } finally { setIsSearching(false); }
    }, 500);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input 
        type="text" 
        value={query} 
        onChange={handleSearch} 
        placeholder="Поиск товара..." 
        style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} 
      />
      {isSearching && <span style={{ position: 'absolute', right: '10px', top: '8px', color: '#999', fontSize: '12px', fontFamily: 'inherit' }}>Поиск...</span>}
      {isOpen && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #d4d5d8', borderRadius: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {results.map(item => (
            <div key={item.id} onClick={() => { onSelect(item); setQuery(''); setIsOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '13px', color: '#333', fontFamily: 'inherit' }} onMouseEnter={(e) => e.target.style.backgroundColor = '#f4f5f7'} onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}>
              <div style={{ fontWeight: 'bold' }}>{item.name}</div>
              <div style={{ color: '#999', fontSize: '11px' }}>Арт: {item.sku} | НДС: {item.vat_rate}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const OneCIntegrationButton = ({ serverUrl, login1c, password1c, n8n, amo_token }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('orders'); 
  const [view, setView] = useState('list'); 
  const [toast, setToast] = useState(null);

  const invoiceIssuedWebhookUrl = 'https://n8n.24tema.ru/webhook/api/v4/leads/invoice-issued';

  const proxyUrl = (() => {
    let base = n8n || 'n8n.24tema.ru';
    if (!base.startsWith('http')) base = `https://${base}`;
    return `${base.replace(/\/$/, '')}/webhook/1c-proxy`;
  })();

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000); 
  };

  const [docLists, setDocLists] = useState({ orders: [], invoices: [], upds: [], contracts: [], dkps: [] });
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState(null);

  const [warehouses, setWarehouses] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [vatRates, setVatRates] = useState([]);

  const [editingOrderId, setEditingOrderId] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState('');
  const [orderItems, setOrderItems] = useState([]);

  const [selectedDocOrder, setSelectedDocOrder] = useState('');
  const [selectedDocContract, setSelectedDocContract] = useState('');
  
  const [dkpForm, setDkpForm] = useState({
    contract_number: '', 
    contract_date: '',
    contract_expiration_date: '',
    delivery_date: '',
    prepayment_amount: '',
    delivery_term: '',
    warranty_term: '',
    sug_volume: '',
    contract_price: 'стеллы на момент реализации с учетом индивидуальных скидок за 1 литр СУГ'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const getDealId = () => {
    const match = (window.location.pathname || '').match(/\/leads\/detail\/(\d+)/);
    if (match && match[1]) return match[1];
    const leadElement = document.querySelector('[data-id="lead_id"] .tag');
    if (leadElement) return (leadElement.textContent || leadElement.innerText).replace('#', '').trim();
    return null;
  };

  const sendInvoiceIssuedWebhook = async () => {
    const dealId = getDealId();
    if (!dealId) throw new Error('Не удалось определить ID сделки.');
    const numericDealId = Number(dealId);
    if (!Number.isSafeInteger(numericDealId)) throw new Error('ID сделки имеет неверный формат.');

    const response = await fetch(invoiceIssuedWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: numericDealId })
    });

    if (!response.ok) {
      throw new Error(`Webhook вернул ошибку ${response.status}.`);
    }

    return dealId;
  };

  const getCompanyId = () => {
    try {
      const amodata = window.AMOCRM?.data;
      if (amodata?.current_entity === 'leads') {
        if (amodata.current_card?.company?.id) return amodata.current_card.company.id;
        if (amodata.current_card?.linked_company_id) return amodata.current_card.linked_company_id;
      }
    } catch(e) {}

    const links = document.querySelectorAll('a[href*="/companies/detail/"]');
    for (let i = 0; i < links.length; i++) {
      const match = links[i].getAttribute('href').match(/\/companies\/detail\/(\d+)/);
      if (match && match[1]) return match[1];
    }

    const input = document.querySelector('input[name="company_id"], input[name="company[id]"], input[name="company[ID]"]');
    if (input && input.value) return input.value;

    return null;
  };

  const getAuthHeaders = () => {
    const headers = { 'Accept': 'application/json' };
    if (login1c && password1c) headers['Authorization'] = `Basic ${btoa(login1c + ':' + password1c)}`;
    return headers;
  };

  // --- ОБНОВЛЕННАЯ ФУНКЦИЯ fetchViaProxy С УМНЫМ ПОВТОРОМ ЗАПРОСОВ ---
  const fetchViaProxy = async (endpoint, options = {}, retries = 2) => {
    const cleanBaseUrl = serverUrl.replace(/\/$/, '');
    const targetUrl = `${cleanBaseUrl}${endpoint}`;
    
    const headers = {
      ...getAuthHeaders(),
      'X-1C-Url': targetUrl,
      'Cache-Control': 'no-cache',
      ...(options.headers || {})
    };

    const executeFetch = async (attemptsLeft) => {
      try {
        const res = await fetch(proxyUrl, { ...options, headers });
        
        // Анализируем ошибку только если статус не 2xx
        if (!res.ok) {
          const clone = res.clone();
          const rawText = await clone.text();

          // Перечень временных блокировок и ошибок синхронизации 1С
          const isTransientError = 
            rawText.includes('Ошибка при вызове метода контекста') || 
            rawText.includes('Тип не определен') ||
            rawText.includes('Запись не найдена в менеджере имен базы данных') ||
            rawText.includes('операции с информационной базой');

          if (isTransientError && attemptsLeft > 0) {
            console.warn(`Временная ошибка 1С. Ждем 2 секунды... (Осталось попыток: ${attemptsLeft})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return executeFetch(attemptsLeft - 1);
          }
        }
        
        return res;
      } catch (err) {
        if (attemptsLeft > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return executeFetch(attemptsLeft - 1);
        }
        throw err;
      }
    };

    return executeFetch(retries);
  };
  // ---------------------------------------------------------------------

  const fetchDocumentsList = async (tabName) => {
    const dealId = getDealId();
    const companyId = getCompanyId();
    if (!serverUrl || !dealId) return;

    setIsLoadingList(true);
    setListError(null);
    try {
      let endpoint = '';
      
      if (tabName === 'orders') endpoint = `/hs/integration/v1/orders?amo_id=${dealId}`;
      else if (tabName === 'invoices') endpoint = `/hs/integration/v1/generate-invoice?amo_id=${dealId}`;
      else if (tabName === 'upds') endpoint = `/hs/integration/v1/generate-upd?amo_id=${dealId}`;
      else if (tabName === 'dkps') endpoint = `/hs/integration/v1/generate-dkp?amo_id=${dealId}`;
      else if (tabName === 'contracts') {
        if (!companyId) {
          setListError("К сделке не привязана компания. Невозможно загрузить договоры.");
          setIsLoadingList(false);
          return;
        }
        endpoint = `/hs/integration/v1/dog_pros?amo_id=${companyId}`;
      }

      const res = await fetchViaProxy(endpoint, { method: 'GET' });
      const rawText = await res.text();
      
      if (res.ok) {
        const data = JSON.parse(rawText);
        setDocLists(prev => ({ ...prev, [tabName]: Array.isArray(data) ? data : [] }));
      } else {
        const errorMessage = parse1CError(rawText);
        if (errorMessage.toLowerCase().includes('не найден')) {
          setDocLists(prev => ({ ...prev, [tabName]: [] }));
        } else {
          setListError(errorMessage);
        }
      }
    } catch (err) {
      setListError("Ошибка соединения с 1С.");
    } finally {
      setIsLoadingList(false);
    }
  };

  const fetchDictionaries = async () => {
    if (warehouses.length > 0) return;
    try {
      const results = await Promise.all([
        fetchViaProxy(`/hs/integration/v1/warehouses`, { method: 'GET' }),
        fetchViaProxy(`/hs/integration/v1/bank_accounts`, { method: 'GET' }),
        fetchViaProxy(`/hs/integration/v1/vat-rates`, { method: 'GET' })
      ]);
      
      const dataW = results[0].ok ? await results[0].json() : [];
      const dataB = results[1].ok ? await results[1].json() : [];
      const dataV = results[2].ok ? await results[2].json() : [];

      setWarehouses(Array.isArray(dataW) ? dataW : []);
      setBankAccounts(Array.isArray(dataB) ? dataB : []);
      setVatRates(Array.isArray(dataV) ? dataV : []);
    } catch (err) { 
      console.error("Ошибка словарей", err); 
      setWarehouses([]);
      setBankAccounts([]);
      setVatRates([]);
    }
  };

  const handleOpenOrderForm = async (orderId = null) => {
    const amoCompId = getCompanyId();
    if (!amoCompId) {
      return showToast("В сделке нет привязанной компании! Сначала привяжите компанию к сделке.", "error");
    }

    setIsLoadingList(true);
    try {
      const compRes = await fetchViaProxy(`/hs/integration/v1/companies?amo_id=${amoCompId}`, { method: 'GET' });
      if (compRes.ok) {
        const compData = await compRes.json();
        const parsedComp = Array.isArray(compData) ? compData[0] : compData;
        if (!parsedComp || parsedComp.status !== 'found' || !parsedComp.id) {
          setIsLoadingList(false);
          return showToast("Компания не синхронизирована с 1С. Пожалуйста, сначала создайте контрагента.", "error");
        }
      } else {
        setIsLoadingList(false);
        return showToast("Ошибка при проверке контрагента в 1С.", "error");
      }
    } catch (err) {
      setIsLoadingList(false);
      return showToast("Сетевая ошибка при проверке контрагента.", "error");
    }
    setIsLoadingList(false);

    fetchDictionaries();
    setView('order_form');
    setEditingOrderId(orderId);
    
    if (orderId) {
      loadOrderForEdit(orderId);
    } else {
      setDeliveryAddress(''); setSelectedWarehouse(''); setSelectedBankAccount('');
      setOrderItems([{ id: Date.now(), nomenclature_id: '', name: '', quantity: 1, price: 0, sum: 0, vat_sum: 0, total: 0, vat_rate_id: 'БезНДС' }]);
    }
  };

  const loadOrderForEdit = async (orderId) => {
    setIsLoadingList(true);
    try {
      const res = await fetchViaProxy(`/hs/integration/v1/orders/get?id=${orderId}`, { method: 'GET' });
      if (res.ok) {
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData[0] : rawData;

        if (data) {
          setDeliveryAddress(data.delivery_address || '');
          setSelectedWarehouse(data.warehouse_id || '');
          setSelectedBankAccount(data.bank_account_id || '');
          
          if (data.products && Array.isArray(data.products)) {
              const enrichedProducts = await Promise.all(data.products.map(async (p, i) => {
                let itemName = p.name || p.nomenclature_name;
                
                if (!itemName && p.nomenclature_id) {
                  try {
                    const nomRes = await fetchViaProxy(`/hs/integration/v1/nomenclature?id=${p.nomenclature_id}`, { method: 'GET' });
                    if (nomRes.ok) {
                      const nomData = await nomRes.json();
                      if (Array.isArray(nomData) && nomData.length > 0 && nomData[0].name) {
                        itemName = nomData[0].name;
                      }
                    }
                  } catch (err) {
                    console.error(`Ошибка загрузки имени товара ${p.nomenclature_id}:`, err);
                  }
                }
                
                return { ...p, id: i, name: itemName || 'Товар из 1С' };
              }));

              setOrderItems(enrichedProducts);
          }
        }
      } else {
        const errText = await res.text();
        showToast(parse1CError(errText), 'error');
      }
    } catch (e) {
      showToast("Не удалось подключиться к server при загрузке заказа.", 'error');
    } finally {
      setIsLoadingList(false);
    }
  };

  const mapVatRateToId = (vatStr) => {
    if (!vatStr) return "БезНДС";
    const cleanStr = vatStr.trim();
    if (cleanStr === "22%") return "НДС22";
    if (cleanStr === "22/122") return "НДС22_122";
    if (cleanStr === "20%") return "НДС20";
    if (cleanStr === "20/120") return "НДС20_120";
    if (cleanStr === "18%") return "НДС18";
    if (cleanStr === "18/118") return "НДС18_118";
    if (cleanStr === "10%") return "НДС10";
    if (cleanStr === "10/110") return "НДС10_110";
    if (cleanStr === "7%") return "НДС7";
    if (cleanStr === "7/107") return "НДС7_107";
    if (cleanStr === "5%") return "НДС5";
    if (cleanStr === "5/105") return "НДС5_105";
    if (cleanStr === "0%") return "НДС0";
    return "БезНДС";
  };

  const calculateRowValues = (quantity, price, vatRateId) => {
    const total = quantity * price;
    let sum = total;
    let vatSum = 0;

    switch (vatRateId) {
        case "НДС22": sum = total / 1.22; vatSum = total - sum; break;
        case "НДС22_122": vatSum = total * 22 / 122; sum = total - vatSum; break;
        case "НДС20": sum = total / 1.20; vatSum = total - sum; break;
        case "НДС20_120": vatSum = total * 20 / 120; sum = total - vatSum; break;
        case "НДС18": sum = total / 1.18; vatSum = total - sum; break;
        case "НДС18_118": vatSum = total * 18 / 118; sum = total - vatSum; break;
        case "НДС10": sum = total / 1.10; vatSum = total - sum; break;
        case "НДС10_110": vatSum = total * 10 / 110; sum = total - vatSum; break;
        case "НДС7": sum = total / 1.07; vatSum = total - sum; break;
        case "НДС7_107": vatSum = total * 7 / 107; sum = total - vatSum; break;
        case "НДС5": sum = total / 1.05; vatSum = total - sum; break;
        case "НДС5_105": vatSum = total * 5 / 105; sum = total - vatSum; break;
        case "НДС0":
        case "БезНДС":
        default: sum = total; vatSum = 0; break;
    }

    return {
        sum: Number(sum.toFixed(2)),
        vat_sum: Number(vatSum.toFixed(2)),
        total: Number(total.toFixed(2))
    };
  };

  const updateItem = (id, field, value) => {
    setOrderItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updatedItem = { ...item, [field]: value };
      if (['quantity', 'price', 'vat_rate_id'].includes(field)) {
        return { ...updatedItem, ...calculateRowValues(Number(updatedItem.quantity), Number(updatedItem.price), updatedItem.vat_rate_id) };
      }
      return updatedItem;
    }));
  };

  const handleSubmitOrder = async () => {
    if (!selectedWarehouse || !selectedBankAccount) return showToast("Выберите склад и счет!", 'error');
    const validProducts = orderItems.filter(i => i.nomenclature_id);
    if (validProducts.length === 0) return showToast("Добавьте товар!", 'error');

    setIsSubmitting(true);
    try {
      const amoCompId = getCompanyId();
      let contractorGuid = "";

      const compRes = await fetchViaProxy(`/hs/integration/v1/companies?amo_id=${amoCompId}`, { method: 'GET' });
      if (compRes.ok) {
        const compData = await compRes.json();
        const parsedComp = Array.isArray(compData) ? compData[0] : compData;
        if (parsedComp && parsedComp.status === 'found' && parsedComp.id) {
          contractorGuid = parsedComp.id;
        }
      }

      if (!contractorGuid) {
        setIsSubmitting(false);
        return showToast("Компания не синхронизирована с 1С.", "error");
      }

      const payload = {
        amo_id: getDealId(),
        delivery_address: deliveryAddress,
        total_sum: Number(orderItems.reduce((acc, i) => acc + i.total, 0).toFixed(2)),
        contractor_id: contractorGuid,
        warehouse_id: selectedWarehouse,
        bank_account_id: selectedBankAccount,
        products: validProducts.map(p => ({
          nomenclature_id: p.nomenclature_id, quantity: Number(p.quantity), price: Number(p.price),
          sum: Number(p.sum), vat_sum: Number(p.vat_sum), total: Number(p.total), vat_rate_id: p.vat_rate_id
        }))
      };

      if (editingOrderId) payload.id = editingOrderId; 

      const res = await fetchViaProxy('/hs/integration/v1/orders', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload)
      });

      if (res.ok) { 
        showToast("Заказ успешно сохранен!", 'success'); 
        setView('list'); 
        fetchDocumentsList('orders'); 
      } else {
        const errText = await res.text();
        showToast(parse1CError(errText), 'error');
      }
    } catch (err) { 
      showToast("Ошибка сервера сети.", 'error'); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleDKPSubmit = (e) => {
    e.preventDefault();
    if (!selectedDocOrder) return showToast("Выберите Заказ-основание", "error");

    const formattedDate = dkpForm.contract_date ? `${dkpForm.contract_date}T00:00:00` : '';
    const formattedExpiration = dkpForm.contract_expiration_date ? `${dkpForm.contract_expiration_date}T00:00:00` : '';
    const formattedDelivery = dkpForm.delivery_date ? `${dkpForm.delivery_date}T00:00:00` : '';
    
    handleGenerateDoc('generate-dkp', { 
      order_id: selectedDocOrder, 
      amo_id: getDealId(), 
      contract_number: dkpForm.contract_number,
      contract_date: formattedDate,
      contract_expiration_date: formattedExpiration,
      delivery_date: formattedDelivery,
      prepayment_amount: Number(dkpForm.prepayment_amount) || 0,
      delivery_term: Number(dkpForm.delivery_term) || 0,
      warranty_term: Number(dkpForm.warranty_term) || 0,
      sug_volume: Number(dkpForm.sug_volume) || 0,
      contract_subject: dkpForm.contract_price
    });
  };

  const handleGenerateDoc = async (endpoint, payloadData) => {
    setIsSubmitting(true);
    try {
      const res = await fetchViaProxy(`/hs/integration/v1/${endpoint}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payloadData)
      });
      if (res.ok) {
        const data = await res.json();
        let successMessage = "Документ успешно создан!";
        let toastType = "success";

        if (endpoint === "generate-upd" && Array.isArray(data) && data[0]?.status === "draft") {
          successMessage = "Недостаточно остатков на складе. УПД сохранен как черновик.";
          toastType = "error";
        }

        if (endpoint === "generate-invoice") {
          try {
            await sendInvoiceIssuedWebhook();
            successMessage = "Счет успешно создан, webhook отправлен!";
          } catch (error) {
            console.error('Счет создан, но invoice-issued webhook не отправлен:', error);
            successMessage = `Счет успешно создан, но webhook не отправлен: ${error.message}`;
            toastType = "error";
          }
        }

        showToast(successMessage, toastType);
        setView("list");
        fetchDocumentsList(activeTab);
      } else {
        const errText = await res.text();
        showToast(parse1CError(errText), 'error');
      }
    } catch (err) { 
      showToast("Ошибка сервера сети.", 'error'); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleDownloadPdf = async (docId, docType, docNumber) => {
    const dealId = getDealId();
    if (!dealId) return showToast("Не удалось определить ID сделки", 'error');

    setIsSubmitting(true);
    try {
      let pdfEndpoint = '';
      let fileName = '';

      if (docType === 'invoices') {
        pdfEndpoint = `/hs/integration/v1/invoices/${docId}/pdf`;
        fileName = `Счет_${docNumber}.pdf`;
      } else if (docType === 'upds') {
        pdfEndpoint = `/hs/integration/v1/upd/${docId}/pdf`;
        fileName = `УПД_${docNumber}.pdf`;
      } else if (docType === 'dkps') {
        pdfEndpoint = `/hs/integration/v1/dogovor/pdf?guid=${docId}&type=1`;
        fileName = `Договор_${docNumber}.pdf`;
      } else {
        return showToast("PDF недоступен для этого типа документа.", 'error');
      }

      const res = await fetchViaProxy(pdfEndpoint, { method: 'GET' });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(parse1CError(errText));
      }
      const blob = await res.blob();

      const localDownloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = localDownloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(localDownloadUrl);
      a.remove();

      const accountRes = await fetch('/api/v4/account?with=drive_url', {
        headers: { 'Authorization': `Bearer ${amo_token}` }
      });
      if (!accountRes.ok) throw new Error("Не удалось получить настройки аккаунта (drive_url).");
      const accountData = await accountRes.json();
      const driveUrl = accountData.drive_url || 'https://drive-b.amocrm.ru';

      const sessionRes = await fetch(`${driveUrl}/v1.0/sessions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${amo_token}` 
        },
        body: JSON.stringify({ 
          file_name: fileName, 
          file_size: blob.size
        })
      });
      
      if (!sessionRes.ok) throw new Error("Ошибка создания сессии загрузки файлов. Проверьте токен.");
      const sessionData = await sessionRes.json();
      const maxPartSize = sessionData.max_part_size || 524288;
      let currentUploadUrl = sessionData.upload_url;
      
      let offset = 0;
      let fileUuid = null;

      while (offset < blob.size) {
        const chunk = blob.slice(offset, offset + maxPartSize);
        
        const uploadRes = await fetch(currentUploadUrl, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${amo_token}`
          },
          body: chunk
        });

        if (!uploadRes.ok) throw new Error("Ошибка загрузки части файла на диск.");
        const uploadData = await uploadRes.json();

        if (uploadData.next_url) {
          currentUploadUrl = uploadData.next_url;
          offset += maxPartSize;
        } else {
          if (Array.isArray(uploadData) && uploadData.length > 0 && uploadData[0].uuid) {
            fileUuid = uploadData[0].uuid;
          } else if (uploadData.uuid) {
            fileUuid = uploadData.uuid;
          } else if (uploadData._embedded && uploadData._embedded.files && uploadData._embedded.files[0].uuid) {
            fileUuid = uploadData._embedded.files[0].uuid;
          }
          break;
        }
      }

      if (!fileUuid) {
        throw new Error("Файл загружен на диск, но UUID не был получен.");
      }

      const linkRes = await fetch(`/api/v4/leads/${dealId}/files`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${amo_token}`
        },
        body: JSON.stringify([{ file_uuid: fileUuid }])
      });

      if (!linkRes.ok) throw new Error("Ошибка привязки файла к сделке.");
      showToast("Файл успешно загружен и привязан к сделке!", 'success');

    } catch (error) {
      console.error(error); 
      showToast(error.message, 'error');
    } finally { setIsSubmitting(false); }
  };

  useEffect(() => {
    const loadFormData = async () => {
      if (!isModalOpen) return;
      if (view === 'list') {
        await fetchDocumentsList(activeTab);
      } else {
        if (docLists.orders.length === 0) {
          await fetchDocumentsList('orders');
        }
        if (view === 'upd_form' || view === 'invoice_form') {
          await fetchDocumentsList('contracts');
        }
      }
    };
    loadFormData();
  }, [activeTab, isModalOpen, view]);

  const tabStyle = (tab) => ({
    padding: '10px 15px', cursor: 'pointer', borderBottom: activeTab === tab ? '3px solid #4c8bf7' : '3px solid transparent',
    color: activeTab === tab ? '#333' : '#999', fontWeight: activeTab === tab ? 'bold' : 'normal', transition: 'all 0.2s', fontFamily: 'inherit'
  });

  return (
    <>
      <style>{`
        .no-spinners::-webkit-inner-spin-button, 
        .no-spinners::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        .no-spinners { 
          -moz-appearance: textfield; 
        }
      `}</style>
      
      <button type="button" onClick={() => { setIsModalOpen(true); setView('list'); }} style={{ backgroundColor: '#4c8bf7', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', width: '100%', fontFamily: 'inherit' }}>
        Интеграция с 1С
      </button>

      {toast && (
        <div style={{
          position: 'fixed', top: '150px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999999,
          background: toast.type === 'error' ? '#e74c3c' : '#32c861', color: 'white', padding: '15px 30px',
          borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: '600px', width: 'max-content',
          textAlign: 'center', fontSize: '15px', lineHeight: '1.4', fontWeight: 'bold', transition: 'all 0.3s ease', fontFamily: 'inherit'
        }}>
          <strong>{toast.type === 'error' ? 'Ошибка: ' : 'Успех! '}</strong>
          {toast.message}
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', width: view === 'order_form' || view === 'dkp_form' ? '900px' : '650px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease', fontFamily: 'inherit' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#333', fontFamily: 'inherit' }}>Управление документами 1С</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#333', opacity: 1, fontFamily: 'inherit' }}>&times;</button>
            </div>

            {view === 'list' && (
              <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '15px' }}>
                <div style={tabStyle('orders')} onClick={() => setActiveTab('orders')}>Заказы</div>
                <div style={tabStyle('invoices')} onClick={() => setActiveTab('invoices')}>Счета</div>
                <div style={tabStyle('upds')} onClick={() => setActiveTab('upds')}>УПД</div>
                <div style={tabStyle('dkps')} onClick={() => setActiveTab('dkps')}>Договоры (ДКП)</div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
              {view === 'list' && (
                <div>
                  {isLoadingList ? <div style={{ textAlign: 'center', padding: '20px', color: '#333', fontFamily: 'inherit' }}>Загрузка...</div> : 
                   listError ? <div style={{ color: '#d93025', padding: '10px', background: '#fef0f0', borderRadius: '6px', fontFamily: 'inherit' }}>{listError}</div> : 
                   docLists[activeTab].length === 0 ? <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontFamily: 'inherit' }}>Документы не найдены.</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {docLists[activeTab].map((doc, i) => {
                        let titleText = `№ ${doc.number || 'б/н'} от ${formatDocDate(doc.date)}`;
                        let subText = '';

                        if (activeTab === 'orders' || activeTab === 'invoices') {
                          const statusPart = doc.is_posted !== undefined ? ` | Статус: ${doc.is_posted ? 'Проведен' : 'Черновик'}` : '';
                          subText = `Сумма: ${doc.total_sum || 0} ₽${statusPart}`;
                        } else if (activeTab === 'upds') {
                          const statusText = doc.is_posted ? 'Проведен' : 'Черновик';
                          const sumPart = doc.total_sum !== undefined ? `Сумма: ${doc.total_sum} ₽ | ` : '';
                          subText = `${sumPart}Статус: ${statusText}`;
                        } else if (activeTab === 'dkps') {
                          titleText = doc.name || 'Без названия';
                          subText = `Статус: Действует`;
                        }

                        return (
                          <div key={i} style={{ border: '1px solid #e1e1e1', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#333', fontFamily: 'inherit' }}>
                            <div>
                              <div style={{ fontWeight: 'bold' }}>{titleText}</div>
                              <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{subText}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {activeTab !== 'orders' && (
                                <button type="button" onClick={() => handleDownloadPdf(doc.id, activeTab, doc.number || 'б-н')} disabled={isSubmitting} style={{ padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid #d4d5d8', borderRadius: '4px', cursor: isSubmitting ? 'wait' : 'pointer', color: '#333', opacity: 1, fontFamily: 'inherit' }}>
                                  📄 В сделку (PDF)
                                </button>
                              )}
                              {activeTab === 'orders' && <button type="button" onClick={() => handleOpenOrderForm(doc.id)} style={{ padding: '6px 12px', fontSize: '12px', background: '#f8f9fa', border: '1px solid #d4d5d8', borderRadius: '4px', cursor: 'pointer', color: '#333', opacity: 1, fontFamily: 'inherit' }}>Редактировать</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {view === 'order_form' && (
                 <div>
                 <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                   <div style={{ flex: 1 }}>
                     <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Склад *</label>
                     <select value={selectedWarehouse} onChange={(e) => setSelectedWarehouse(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}>
                       <option value="">-- Выберите склад --</option>
                       {warehouses && Array.isArray(warehouses) && warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                     </select>
                   </div>
                   <div style={{ flex: 1 }}>
                     <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Банковский счет *</label>
                     <select value={selectedBankAccount} onChange={(e) => setSelectedBankAccount(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}>
                       <option value="">-- Выберите счет --</option>
                       {bankAccounts && Array.isArray(bankAccounts) && bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                     </select>
                   </div>
                 </div>
                 
                 <div style={{ marginBottom: '25px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Адрес доставки</label>
                    <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}/>
                 </div>

                 <div style={{ display: 'flex', gap: '10px', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '10px', fontFamily: 'inherit' }}>
                    <div style={{ flex: '3 1 0', minWidth: 0 }}>Номенклатура</div>
                    <div style={{ flex: '0 0 60px' }}>Кол-во</div>
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>Цена</div>
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>НДС</div>
                    <div style={{ flex: '1.5 1 0', minWidth: 0, whiteSpace: 'nowrap' }}>Сумма без НДС</div>
                    <div style={{ flex: '1.2 1 0', minWidth: 0, whiteSpace: 'nowrap' }}>Сумма НДС</div>
                    <div style={{ flex: '1.2 1 0', minWidth: 0 }}>Итого</div>
                    <div style={{ width: '30px' }}></div>
                 </div>

                 {orderItems.map((item) => (
                    <div key={item.id} style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'flex-start', fontFamily: 'inherit' }}>
                      <div style={{ flex: '3 1 0', minWidth: 0 }}>
                        {!item.nomenclature_id ? <ProductSearch serverUrl={serverUrl} proxyUrl={proxyUrl} getAuthHeaders={getAuthHeaders} onSelect={(prod) => { updateItem(item.id, 'nomenclature_id', prod.id); updateItem(item.id, 'name', prod.name); updateItem(item.id, 'vat_rate_id', mapVatRateToId(prod.vat_rate)); }} /> : 
                          <div style={{ padding: '8px 12px', background: '#f4f5f7', borderRadius: '4px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#333', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', marginRight: '8px' }}>{item.name}</span>
                            <button type="button" onClick={() => updateItem(item.id, 'nomenclature_id', '')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#4c8bf7', fontSize: '12px', opacity: 1, fontFamily: 'inherit', flexShrink: 0, padding: 0 }}>Изменить</button>
                          </div>}
                      </div>
                      <div style={{ flex: '0 0 60px' }}>
                        <input type="number" className="no-spinners" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        <input type="number" className="no-spinners" step="0.01" value={item.price} onChange={(e) => updateItem(item.id, 'price', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        <select value={item.vat_rate_id} onChange={(e) => updateItem(item.id, 'vat_rate_id', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}>
                          {vatRates && Array.isArray(vatRates) && vatRates.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: '1.5 1 0', minWidth: 0, padding: '8px 0', color: '#333', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          {item.sum.toFixed(2)}
                      </div>
                      <div style={{ flex: '1.2 1 0', minWidth: 0, padding: '8px 0', color: '#333', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          {item.vat_sum.toFixed(2)}
                      </div>
                      <div style={{ flex: '1.2 1 0', minWidth: 0, padding: '8px 0', fontWeight: 'bold', color: '#333', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          {item.total.toFixed(2)}
                      </div>
                      <div style={{ width: '30px', textAlign: 'center', paddingTop: '4px' }}>
                        <button type="button" onClick={() => setOrderItems(prev => prev.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '18px', opacity: 1, fontFamily: 'inherit' }}>&times;</button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setOrderItems(p => [...p, {
                    id: Date.now(),
                    nomenclature_id: '',
                    name: '',
                    quantity: 1,
                    price: 0,
                    sum: 0,
                    vat_sum: 0,
                    total: 0,
                    vat_rate_id: 'БезНДС'
                  }])} style={{ border: '1px dashed #4c8bf7', color: '#4c8bf7', background: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', width: '100%', opacity: 1, fontFamily: 'inherit' }}>+ Добавить строку</button>

                  <div style={{ marginTop: '20px', borderTop: '2px solid #eee', paddingTop: '15px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '14px', fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ color: '#666', width: '130px', textAlign: 'right' }}>Сумма без НДС:</span>
                      <span style={{ color: '#333', fontWeight: 'bold', width: '120px', textAlign: 'right', fontFamily: 'inherit' }}>
                        {orderItems.reduce((acc, item) => acc + (item.sum || 0), 0).toFixed(2)} ₽
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ color: '#666', width: '130px', textAlign: 'right' }}>Сумма НДС:</span>
                      <span style={{ color: '#333', fontWeight: 'bold', width: '120px', textAlign: 'right', fontFamily: 'inherit' }}>
                        {orderItems.reduce((acc, item) => acc + (item.vat_sum || 0), 0).toFixed(2)} ₽
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '16px' }}>
                      <span style={{ color: '#333', width: '130px', textAlign: 'right' }}>Итого:</span>
                      <span style={{ color: '#333', fontWeight: 'bold', width: '120px', textAlign: 'right', fontFamily: 'inherit' }}>
                        {orderItems.reduce((acc, item) => acc + (item.total || 0), 0).toFixed(2)} ₽
                      </span>
                    </div>
                  </div>

               </div>
              )}

              {(view === 'invoice_form' || view === 'upd_form') && (
                <div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Выберите Заказ-основание *</label>
                    <select value={selectedDocOrder} onChange={(e) => setSelectedDocOrder(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}>
                      <option value="">-- Выберите заказ --</option>
                      {docLists.orders.map(o => <option key={o.id} value={o.id}>Заказ №{o.number} от {formatDocDate(o.date)} ({o.total_sum} ₽)</option>)}
                    </select>
                  </div>
                  
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>
                      Выберите Договор {view === 'upd_form' ? '*' : ''}
                    </label>
                    <select value={selectedDocContract} onChange={(e) => setSelectedDocContract(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}>
                      <option value="">-- Выберите договор --</option>
                      {docLists.contracts.map(c => <option key={c.id} value={c.id}>{c.name || 'Без названия'}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {view === 'dkp_form' && (
                <form id="dkp-form" onSubmit={handleDKPSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontFamily: 'inherit' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', display: 'block', color: '#333', fontFamily: 'inherit' }}>Основание (Заказ) *</label>
                    <select required value={selectedDocOrder} onChange={(e) => setSelectedDocOrder(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #d4d5d8', borderRadius: '4px', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}>
                      <option value="">-- Выберите заказ --</option>
                      {docLists.orders.map(o => <option key={o.id} value={o.id}>Заказ №{o.number} от {formatDocDate(o.date)} ({o.total_sum} ₽)</option>)}
                    </select>
                  </div>
                  
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Номер договора</label><input type="text" value={dkpForm.contract_number} onChange={e => setDkpForm({...dkpForm, contract_number: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder="Оставьте пустым для автогенерации"/></div>
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Дата договора *</label><input required type="date" value={dkpForm.contract_date} onChange={e => setDkpForm({...dkpForm, contract_date: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}/></div>
                  
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Срок действия договора *</label><input required type="date" value={dkpForm.contract_expiration_date} onChange={e => setDkpForm({...dkpForm, contract_expiration_date: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}/></div>
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Срок поставки *</label><input required type="date" value={dkpForm.delivery_date} onChange={e => setDkpForm({...dkpForm, delivery_date: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}/></div>
                  
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Предоплата (₽)</label><input type="number" className="no-spinners" step="0.01" value={dkpForm.prepayment_amount} onChange={e => setDkpForm({...dkpForm, prepayment_amount: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder=""/></div>
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Срок отгрузки (дней)</label><input type="number" className="no-spinners" value={dkpForm.delivery_term} onChange={e => setDkpForm({...dkpForm, delivery_term: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder=""/></div>
                  
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Срок гарантии</label><input type="number" className="no-spinners" value={dkpForm.warranty_term} onChange={e => setDkpForm({...dkpForm, warranty_term: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder=""/></div>
                  <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Объем СУГ (л)</label><input type="number" className="no-spinners" step="0.01" value={dkpForm.sug_volume} onChange={e => setDkpForm({...dkpForm, sug_volume: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder=""/></div>
                  
                  <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Цена договора *</label><input required type="text" value={dkpForm.contract_price} onChange={e => setDkpForm({...dkpForm, contract_price: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} /></div>
                </form>
              )}

            </div>

            <div style={{ borderTop: '1px solid #eee', paddingTop: '15px', marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
              {view === 'list' ? (
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 16px', border: '1px solid #d4d5d8', background: 'white', borderRadius: '6px', cursor: 'pointer', color: '#333', fontWeight: '500', opacity: 1, fontFamily: 'inherit' }}>Закрыть</button>
              ) : (
                <button type="button" onClick={() => setView('list')} style={{ padding: '10px 16px', border: '1px solid #d4d5d8', background: 'white', borderRadius: '6px', cursor: 'pointer', color: '#333', fontWeight: '500', opacity: 1, fontFamily: 'inherit' }}>Отмена</button>
              )}

              {view === 'list' && activeTab === 'orders' && <button type="button" onClick={() => handleOpenOrderForm()} style={{ padding: '10px 16px', border: 'none', background: '#32c861', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>+ Создать Заказ</button>}
              {view === 'list' && activeTab === 'invoices' && <button type="button" onClick={() => setView('invoice_form')} style={{ padding: '10px 16px', border: 'none', background: '#32c861', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>+ Создать Счет</button>}
              {view === 'list' && activeTab === 'upds' && <button type="button" onClick={() => setView('upd_form')} style={{ padding: '10px 16px', border: 'none', background: '#32c861', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>+ Создать УПД</button>}
              {view === 'list' && activeTab === 'dkps' && <button type="button" onClick={() => setView('dkp_form')} style={{ padding: '10px 16px', border: 'none', background: '#32c861', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>+ Создать Договор</button>}

              {view === 'order_form' && <button type="button" onClick={handleSubmitOrder} disabled={isSubmitting} style={{ padding: '10px 24px', border: 'none', background: '#4c8bf7', color: 'white', borderRadius: '6px', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>Сохранить заказ</button>}
              
              {view === 'invoice_form' && (
                <button 
                  type="button" 
                  onClick={() => handleGenerateDoc('generate-invoice', { order_id: selectedDocOrder, contract_id: selectedDocContract || null, amo_id: getDealId() })} 
                  disabled={isSubmitting || !selectedDocOrder} 
                  style={{ padding: '10px 24px', border: 'none', background: '#4c8bf7', color: 'white', borderRadius: '6px', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}
                >
                  Создать счет
                </button>
              )}
              
              {view === 'upd_form' && (
                <button 
                  type="button" 
                  onClick={() => handleGenerateDoc('generate-upd', { order_id: selectedDocOrder, contract_id: selectedDocContract, amo_id: getDealId() })} 
                  disabled={isSubmitting || !selectedDocOrder || !selectedDocContract} 
                  style={{ padding: '10px 24px', border: 'none', background: '#4c8bf7', color: 'white', borderRadius: '6px', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}
                >
                  Создать УПД
                </button>
              )}
              
              {view === 'dkp_form' && (
                <button 
                  type="submit" 
                  form="dkp-form"
                  disabled={isSubmitting} 
                  style={{ padding: '10px 24px', border: 'none', background: '#4c8bf7', color: 'white', borderRadius: '6px', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}
                >
                  Создать договор
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default OneCIntegrationButton;
