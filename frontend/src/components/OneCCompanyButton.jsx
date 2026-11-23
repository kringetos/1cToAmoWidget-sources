import React, { useState, useEffect } from 'react';

const formatDocDate = (isoString) => {
  if (!isoString) return '';
  try {
    const [datePart] = isoString.split('T');
    const [year, month, day] = datePart.split('-');
    return `${day}.${month}.${year}`;
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

const fetchAmoCompanyData = async (companyId, amoToken) => {
  try {
    const response = await fetch(`/api/v4/companies/${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${amoToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      const data = await response.json();
      let inn = '';
      let kpp = '';
      let phone = '';
      let email = '';
      let address = '';
      let postal_address = '';
      let bank_account = '';
      let bank_bic = '';
      let bank_name = '';
      let bank_corr = '';
      
      if (data.custom_fields_values) {
        const innField = data.custom_fields_values.find(f => f.field_id === 1642027);
        if (innField && innField.values && innField.values.length > 0) inn = innField.values[0].value;
        
        const kppField = data.custom_fields_values.find(f => f.field_id === 1642031);
        if (kppField && kppField.values && kppField.values.length > 0) kpp = kppField.values[0].value;

        const phoneField = data.custom_fields_values.find(f => f.field_id === 826233);
        if (phoneField && phoneField.values && phoneField.values.length > 0) phone = phoneField.values[0].value;

        const emailField = data.custom_fields_values.find(f => f.field_id === 826235);
        if (emailField && emailField.values && emailField.values.length > 0) email = emailField.values[0].value;

        const addressField = data.custom_fields_values.find(f => f.field_id === 826239);
        if (addressField && addressField.values && addressField.values.length > 0) address = addressField.values[0].value;

        const postalAddressField = data.custom_fields_values.find(f => f.field_id === 1646325);
        if (postalAddressField && postalAddressField.values && postalAddressField.values.length > 0) postal_address = postalAddressField.values[0].value;

        const bankAccountField = data.custom_fields_values.find(f => f.field_id === 1646327);
        if (bankAccountField && bankAccountField.values && bankAccountField.values.length > 0) bank_account = bankAccountField.values[0].value;

        const bankBicField = data.custom_fields_values.find(f => f.field_id === 1646331);
        if (bankBicField && bankBicField.values && bankBicField.values.length > 0) bank_bic = bankBicField.values[0].value;

        const bankNameField = data.custom_fields_values.find(f => f.field_id === 1646335);
        if (bankNameField && bankNameField.values && bankNameField.values.length > 0) bank_name = bankNameField.values[0].value;

        const bankCorrField = data.custom_fields_values.find(f => f.field_id === 1646333);
        if (bankCorrField && bankCorrField.values && bankCorrField.values.length > 0) bank_corr = bankCorrField.values[0].value;
      }
      return { name: data.name, inn, kpp, phone, email, address, postal_address, bank_account, bank_bic, bank_name, bank_corr };
    }
  } catch (error) {
    console.error("Ошибка при получении компании по API:", error);
  }
  return { name: null, inn: '', kpp: '', phone: '', email: '', address: '', postal_address: '', bank_account: '', bank_bic: '', bank_name: '', bank_corr: '' };
};

const OneCCompanyButton = ({ serverUrl, login1c, password1c, n8n, amo_token }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); 
  
  const [companyData, setCompanyData] = useState(null); 
  const [errorMessage, setErrorMessage] = useState(null);
  const [toast, setToast] = useState(null);

  const [activeTab, setActiveTab] = useState('info'); 
  const [view, setView] = useState('list'); 

  const [inn, setInn] = useState('');
  const [kpp, setKpp] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  
  const [postalAddress, setPostalAddress] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankBic, setBankBic] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCorr, setBankCorr] = useState('');

  const [signatoryForm, setSignatoryForm] = useState({
    contact_last_name: '',
    contact_first_name: '',
    contact_patronymic: '',
    contact_position: '',
    osnovanie: ''
  });
  const [isLoadingSignatory, setIsLoadingSignatory] = useState(false);

  const [contractsList, setContractsList] = useState([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  
  const [dpForm, setDpForm] = useState({
    contract_number: '', 
    contract_date: '',
    contract_expiration_date: '',
    delivery_date: '',
    contract_price: 'стеллы на момент реализации с учетом индивидуальных скидок за 1 литр СУГ'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const proxyUrl = (() => {
    let base = n8n || 'n8n.24tema.ru';
    if (!base.startsWith('http')) base = `https://${base}`;
    return `${base.replace(/\/$/, '')}/webhook/1c-proxy`;
  })();

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const getCompanyId = () => {
    try {
      const amodata = window.AMOCRM.data;
      if (amodata && amodata.current_entity === 'companies' && amodata.current_card && amodata.current_card.id) {
        return amodata.current_card.id;
      }
    } catch (e) {}

    const links = document.querySelectorAll('a[href*="/companies/detail/"]');
    for (let i = 0; i < links.length; i++) {
      const match = links[i].getAttribute('href').match(/\/companies\/detail\/(\d+)/);
      if (match && match[1]) return match[1];
    }

    const idInput = document.querySelector('input[name="company[ID]"], input[name="company[id]"], input[name="company_id"], #company_id');
    if (idInput && idInput.value) return idInput.value;

    const urlMatch = (window.location.pathname || '').match(/\/companies\/detail\/(\d+)/);
    if (urlMatch && urlMatch[1]) return urlMatch[1];

    return null;
  };

  const getCompanyNameFromDOM = () => {
    try {
      const amodata = window.AMOCRM.data;
      if (amodata && amodata.current_entity === 'companies' && amodata.current_card && amodata.current_card.name) {
        return amodata.current_card.name;
      }
    } catch (e) {}

    const links = document.querySelectorAll('a[href*="/companies/detail/"]');
    for (let i = 0; i < links.length; i++) {
      const text = links[i].innerText || links[i].textContent;
      if (text && text.trim() !== '' && !text.includes('...')) return text.trim();
    }

    const nameInput = document.querySelector('input[name="company[NAME]"], input[name="company[name]"], input[name="name"]');
    if (nameInput && nameInput.value) return nameInput.value.trim();

    const titleNode = document.querySelector('.js-card-name, .card-entity-form__top-title');
    if (titleNode && titleNode.innerText) return titleNode.innerText.trim();

    return "Без названия";
  };

  const getAuthHeaders = () => {
    const headers = { 'Accept': 'application/json' };
    if (login1c && password1c) headers['Authorization'] = `Basic ${btoa(login1c + ':' + password1c)}`;
    return headers;
  };

  const fetchViaProxy = async (endpoint, options = {}, retries = 2) => {
    const cleanBaseUrl = serverUrl.replace(/\/$/, '');
    const targetUrl = `${cleanBaseUrl}${endpoint}`;
    
    const headers = {
      ...getAuthHeaders(),
      'X-1C-Url': targetUrl,
      'Cache-Control': 'no-cache', 
      ...(options.headers || {})
    };

    // Определяем метод (GET, POST и т.д.)
    const method = (options.method || 'GET').toUpperCase();
    // Для POST (создание, изменение) отключаем повторные попытки, чтобы избежать дубликатов!
    const maxRetries = method === 'GET' ? retries : 0;

    const executeFetch = async (attemptsLeft) => {
      try {
        const res = await fetch(proxyUrl, { ...options, headers });
        
        if (!res.ok) {
          const clone = res.clone();
          const rawText = await clone.text();

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

    return executeFetch(maxRetries);
  };

  const checkCompanyIn1C = async () => {
    const amoId = getCompanyId();
    if (!amoId) { setErrorMessage("Не удалось определить ID компании."); return; }

    setIsLoading(true); setErrorMessage(null); setSyncStatus('idle');
    try {
      const response = await fetchViaProxy(`/hs/integration/v1/companies?amo_id=${amoId}`, { method: 'GET' });
      const rawText = await response.text();
      
      let parsedData = null;
      try { parsedData = JSON.parse(rawText); } catch (e) {}

      if (Array.isArray(parsedData) && parsedData[0]?.error?.message) {
        const n8nMsg = parsedData[0].error.message;
        const match = n8nMsg.match(/\{[\s\S]*\}/);
        
        if (match) {
          try {
            const innerStr = match[0].replace(/\\"/g, '"').replace(/\\r\\n/g, '').replace(/\\n/g, '');
            const innerJson = JSON.parse(innerStr);
            
            if (innerJson.status === 'not_found') {
              setSyncStatus('not_found');
              return;
            }
          } catch (e) {}
        }
        
        setErrorMessage(parse1CError(rawText));
        return;
      }

      if (!response.ok) {
        setErrorMessage(parse1CError(rawText));
        return;
      }
      
      const data = Array.isArray(parsedData) ? parsedData[0] : parsedData;

      if (data && data.status === 'found') {
        setSyncStatus('found');
        setCompanyData(data);
      } else {
        setSyncStatus('not_found');
      }
    } catch (error) { 
      setErrorMessage("Не удалось подключиться к серверу 1С."); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    const amoId = getCompanyId();
    if (!inn.trim()) return showToast("Пожалуйста, укажите ИНН.", 'error');

    setIsSubmitting(true);
    try {
      const payload = { 
        amo_id: amoId, 
        name: companyName.trim(),
        inn: inn.trim(), 
        kpp: kpp.trim(), 
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        postal_address: postalAddress.trim(),
        bank_account: bankAccount.trim(),
        bank_bic: bankBic.trim(),
        bank_name: bankName.trim(),
        bank_corr: bankCorr.trim()
      };

      const response = await fetchViaProxy('/hs/integration/v1/companies', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) { 
        const rawData = await response.json();
        const data = Array.isArray(rawData) ? rawData[0] : rawData;

        if (data && data.status === 'success') {
          const customFieldsToUpdate = [];

          const addField = (fieldId, value) => {
            if (value && String(value).trim() !== '') {
              customFieldsToUpdate.push({
                field_id: fieldId,
                values: [{ value: String(value).trim() }]
              });
            }
          };

          addField(1642027, data.inn);
          addField(1642031, data.kpp);
          addField(826233, data.phone);
          addField(826235, data.email);
          addField(826239, data.legal_address);
          addField(1646325, data.postal_address);
          addField(1646327, data.bank_account);
          addField(1646331, data.bank_bic);
          addField(1646335, data.bank_name);
          addField(1646333, data.bank_corr);

          const amoPayload = {};
          
          if (data.name_1c && String(data.name_1c).trim() !== '') {
            amoPayload.name = String(data.name_1c).trim();
          }
          
          if (customFieldsToUpdate.length > 0) {
            amoPayload.custom_fields_values = customFieldsToUpdate;
          }

          if (Object.keys(amoPayload).length > 0) {
            try {
              const amoUpdateRes = await fetch(`/api/v4/companies/${amoId}`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${amo_token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(amoPayload)
              });

              if (amoUpdateRes.ok) {
                if (data.name_1c) setCompanyName(data.name_1c);
                if (data.inn) setInn(data.inn);
                if (data.kpp) setKpp(data.kpp);
                if (data.phone) setPhone(data.phone);
                if (data.email) setEmail(data.email);
                if (data.legal_address) setAddress(data.legal_address);
                if (data.postal_address) setPostalAddress(data.postal_address);
                if (data.bank_account) setBankAccount(data.bank_account);
                if (data.bank_bic) setBankBic(data.bank_bic);
                if (data.bank_name) setBankName(data.bank_name);
                if (data.bank_corr) setBankCorr(data.bank_corr);
                
                showToast("Контрагент найден в 1С. Данные в amoCRM успешно обновлены!", 'success');
              } else {
                console.error("Ошибка обновления полей в amoCRM", await amoUpdateRes.text());
                showToast("Контрагент найден в 1С, но не удалось обновить карточку amoCRM", 'error');
              }
            } catch (err) {
              console.error("Сетевая ошибка при обновлении amoCRM", err);
            }
          } else {
             showToast("Контрагент успешно создан!", 'success'); 
          }
        } else {
          showToast("Контрагент успешно создан!", 'success'); 
        }
        
        checkCompanyIn1C(); 
      } else {
        const errText = await response.text();
        showToast(parse1CError(errText), 'error');
      }
    } catch (error) { 
      showToast("Сетевая ошибка при отправке данных в 1С.", 'error'); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const fetchSignatory = async () => {
    const amoId = getCompanyId();
    if (!amoId) return;

    setIsLoadingSignatory(true);
    try {
      const res = await fetchViaProxy(`/hs/integration/v1/signatories?amo_id=${amoId}`, { method: 'GET' });
      if (res.ok) {
        const rawData = await res.json();
        const parsedData = Array.isArray(rawData) ? rawData[0] : rawData;
        
        if (parsedData && parsedData.status === 'success' && parsedData.data) {
          setSignatoryForm({
            contact_last_name: parsedData.data.contact_last_name || '',
            contact_first_name: parsedData.data.contact_first_name || '',
            contact_patronymic: parsedData.data.contact_patronymic || '',
            contact_position: parsedData.data.contact_position || '',
            osnovanie: parsedData.data.osnovanie || ''
          });
        }
      }
    } catch (err) {
      console.error("Ошибка загрузки подписанта", err);
    } finally {
      setIsLoadingSignatory(false);
    }
  };

  const handleSaveSignatory = async (e) => {
    e.preventDefault();
    const amoId = getCompanyId();

    setIsSubmitting(true);
    try {
      const payload = {
        amo_id: amoId,
        ...signatoryForm
      };

      const res = await fetchViaProxy('/hs/integration/v1/signatories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast("Данные подписанта успешно сохранены!", 'success');
      } else {
        const errText = await res.text();
        showToast(parse1CError(errText), 'error');
      }
    } catch (err) {
      showToast("Ошибка сети при сохранении подписанта.", 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchContracts = async () => {
    const amoId = getCompanyId();
    if (!amoId) return;

    setIsLoadingContracts(true);
    try {
      const res = await fetchViaProxy(`/hs/integration/v1/dog_pros?amo_id=${amoId}`, { method: 'GET' });
      const data = await res.json();
      if (Array.isArray(data)) setContractsList(data);
      else if (data.error) console.error(data.error);
    } catch (err) { console.error("Ошибка загрузки договоров", err); } 
    finally { setIsLoadingContracts(false); }
  };

  const handleCreateDP = async (e) => {
    e.preventDefault();
    const amoId = getCompanyId();

    setIsSubmitting(true);
    try {
      const formattedDate = dpForm.contract_date ? `${dpForm.contract_date}T00:00:00` : '';
      const formattedExpiration = dpForm.contract_expiration_date ? `${dpForm.contract_expiration_date}T00:00:00` : '';
      const formattedDelivery = dpForm.delivery_date ? `${dpForm.delivery_date}T00:00:00` : '';
      
      const payload = { 
        amo_id: amoId,
        contract_number: dpForm.contract_number,
        contract_date: formattedDate,
        contract_expiration_date: formattedExpiration,
        delivery_date: formattedDelivery,
        contract_subject: dpForm.contract_price
      }; 
      
      const res = await fetchViaProxy('/hs/integration/v1/generate-dp', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) { 
        showToast("Договор поставки успешно создан!", 'success'); 
        setView('list'); 
        fetchContracts(); 
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

  const handleDownloadPdf = async (docId, docNumber) => {
    const companyId = getCompanyId();
    if (!companyId) return showToast("Не удалось определить ID компании для прикрепления файла", 'error');

    setIsSubmitting(true);
    try {
      const fileName = `Договор_поставки_${docNumber || 'б-н'}.pdf`;

      const res = await fetchViaProxy(`/hs/integration/v1/dogovor/pdf?guid=${docId}&type=2`, { method: 'GET' });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(parse1CError(errText));
      }
      
      const blob = await res.blob();

      const localDownloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = localDownloadUrl; a.download = fileName;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(localDownloadUrl); a.remove();

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
          file_size: blob.size,
          content_type: 'application/pdf'
        })
      });
      
      if (!sessionRes.ok) throw new Error("Ошибка создания сессии загрузки файлов. Проверьте права токена.");
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

        if (!uploadRes.ok) throw new Error("Ошибка загрузки части файла на диск amoCRM.");
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

      const linkRes = await fetch(`/api/v4/companies/${companyId}/files`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${amo_token}`
        },
        body: JSON.stringify([{ file_uuid: fileUuid }])
      });

      if (!linkRes.ok) throw new Error("Ошибка прикрепления файла в карточку компании.");
      
      showToast("PDF успешно скачан и прикреплен во вкладку 'Файлы' компании!", 'success');

    } catch (error) {
      console.error(error); 
      showToast(error.message || "Произошла ошибка при загрузке PDF", 'error');
    } finally { 
      setIsSubmitting(false); 
    }
  };

  useEffect(() => {
    if (activeTab === 'contracts' && view === 'list') {
      fetchContracts();
    } else if (activeTab === 'signatory') {
      fetchSignatory();
    }
  }, [activeTab, view]);

  const handleOpenModal = async (e) => {
    e.preventDefault(); e.stopPropagation();

    const amoId = getCompanyId();
    if (!amoId) {
      showToast("Не удалось определить ID компании.", 'error');
      return;
    }

    setCompanyName('Загрузка...'); 
    setInn('');
    setKpp('');
    setPhone('');
    setEmail('');
    setAddress('');
    setPostalAddress('');
    setBankAccount('');
    setBankBic('');
    setBankName('');
    setBankCorr('');

    setActiveTab('info');
    setView('list');
    setIsModalOpen(true);

    const apiData = await fetchAmoCompanyData(amoId, amo_token);
    setCompanyName(apiData.name || getCompanyNameFromDOM());
    if (apiData.inn) setInn(apiData.inn);
    if (apiData.kpp) setKpp(apiData.kpp);
    if (apiData.phone) setPhone(apiData.phone);
    if (apiData.email) setEmail(apiData.email);
    if (apiData.address) setAddress(apiData.address);
    if (apiData.postal_address) setPostalAddress(apiData.postal_address);
    if (apiData.bank_account) setBankAccount(apiData.bank_account);
    if (apiData.bank_bic) setBankBic(apiData.bank_bic);
    if (apiData.bank_name) setBankName(apiData.bank_name);
    if (apiData.bank_corr) setBankCorr(apiData.bank_corr);

    checkCompanyIn1C();
  };

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

      <button type="button" onClick={handleOpenModal} style={{ backgroundColor: '#4c8bf7', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', width: '100%', fontFamily: 'inherit' }}>
        Интеграция с 1С
      </button>

      {toast && (
        <div style={{
          position: 'fixed', top: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999999,
          background: toast.type === 'error' ? '#e74c3c' : '#32c861', color: 'white', padding: '15px 30px',
          borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: '600px', width: 'max-content',
          textAlign: 'center', fontSize: '15px', lineHeight: '1.4', transition: 'all 0.3s ease', fontFamily: 'inherit'
        }}>
          <strong>{toast.type === 'error' ? 'Ошибка: ' : 'Успех! '}</strong>
          {toast.message}
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', width: view === 'create_dp' ? '700px' : '550px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease', fontFamily: 'inherit', color: '#333' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#222', fontFamily: 'inherit' }}>Контрагент в 1С</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#333', opacity: 1, padding: 0, lineHeight: 1, fontFamily: 'inherit' }}>&times;</button>
            </div>

            <div style={{ marginBottom: '20px', padding: '12px 16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #4c8bf7' }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: 'bold', fontFamily: 'inherit' }}>Карточка amoCRM</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', fontFamily: 'inherit' }}>{companyName}</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: '150px' }}>
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#333', fontFamily: 'inherit' }}>Синхронизация...</div>
              ) : errorMessage ? (
                <div style={{ backgroundColor: '#fef0f0', color: '#d93025', padding: '12px', borderRadius: '6px', fontFamily: 'inherit' }}>{errorMessage}</div>
              ) : (
                <>
                  {syncStatus === 'not_found' && (
                    <div>
                      <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px', fontFamily: 'inherit' }}>Контрагент не синхронизирован. Синхронизируйте с 1С.</div>
                      <form onSubmit={handleCreateCompany}>
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Наименование для 1С *</label>
                          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                          <div style={{ flex: 2 }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>ИНН *</label>
                            <input type="text" value={inn} onChange={(e) => setInn(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>КПП</label>
                            <input type="text" value={kpp} onChange={(e) => setKpp(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Телефон</label>
                            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                          </div>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Юридический адрес</label>
                          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#333', fontFamily: 'inherit' }}>Почтовый адрес</label>
                          <input type="text" value={postalAddress} onChange={(e) => setPostalAddress(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#333', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '6px', fontFamily: 'inherit' }}>Банковские реквизиты</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#666', fontFamily: 'inherit' }}>Расчетный счет</label>
                              <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#666', fontFamily: 'inherit' }}>БИК</label>
                              <input type="text" value={bankBic} onChange={(e) => setBankBic(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#666', fontFamily: 'inherit' }}>Банк</label>
                              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#666', fontFamily: 'inherit' }}>Корреспондентский счёт</label>
                              <input type="text" value={bankCorr} onChange={(e) => setBankCorr(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} />
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="submit" disabled={isSubmitting} style={{ padding: '10px 20px', border: 'none', background: '#32c861', color: 'white', borderRadius: '6px', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>{isSubmitting ? 'Отправка...' : 'Синхронизировать контрагента'}</button>
                        </div>
                      </form>
                    </div>
                  )}

                  {syncStatus === 'found' && (
                    <>
                      <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '20px' }}>
                        <div style={tabStyle('info')} onClick={() => { setActiveTab('info'); setView('list'); }}>Реквизиты</div>
                        <div style={tabStyle('signatory')} onClick={() => { setActiveTab('signatory'); setView('list'); }}>Подписант</div>
                        <div style={tabStyle('contracts')} onClick={() => { setActiveTab('contracts'); setView('list'); }}>Договоры</div>
                      </div>

                      {activeTab === 'info' && companyData && (
                        <div style={{ padding: '20px', backgroundColor: '#f4fbf6', border: '1px solid #c2e6cb', borderRadius: '8px' }}>
                          <div style={{ color: '#155724', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px', fontFamily: 'inherit' }}>✅ Синхронизировано с 1С</div>
                          <div style={{ fontSize: '14px', color: '#333', marginBottom: '8px', fontFamily: 'inherit' }}><span style={{ color: '#666' }}>Наименование в 1С:</span> {companyData.name}</div>
                          <div style={{ fontSize: '14px', color: '#333', fontFamily: 'inherit' }}><span style={{ color: '#666' }}>ID в 1С:</span> {companyData.id}</div>
                        </div>
                      )}

                      {activeTab === 'signatory' && (
                        <div>
                          {isLoadingSignatory ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#333', fontFamily: 'inherit' }}>Загрузка подписанта...</div>
                          ) : (
                            <form id="signatory-form" onSubmit={handleSaveSignatory}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#333' }}>Фамилия *</label>
                                  <input required type="text" value={signatoryForm.contact_last_name} onChange={e => setSignatoryForm({...signatoryForm, contact_last_name: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder="Иванов" />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#333' }}>Имя *</label>
                                  <input required type="text" value={signatoryForm.contact_first_name} onChange={e => setSignatoryForm({...signatoryForm, contact_first_name: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder="Иван" />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#333' }}>Отчество</label>
                                  <input type="text" value={signatoryForm.contact_patronymic} onChange={e => setSignatoryForm({...signatoryForm, contact_patronymic: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder="Иванович" />
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', color: '#333' }}>Должность *</label>
                                  <input required type="text" value={signatoryForm.contact_position} onChange={e => setSignatoryForm({...signatoryForm, contact_position: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder="Генеральный директор" />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', color: '#333' }}>Основание (например, Устава) *</label>
                                  <input required type="text" value={signatoryForm.osnovanie} onChange={e => setSignatoryForm({...signatoryForm, osnovanie: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d4d5d8', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder="Устава" />
                                </div>
                              </div>
                            </form>
                          )}
                        </div>
                      )}

                      {activeTab === 'contracts' && (
                        <div>
                          {view === 'list' && (
                            <>
                              {isLoadingContracts ? <div style={{ textAlign: 'center', padding: '20px', color: '#333', fontFamily: 'inherit' }}>Загрузка...</div> : 
                               contractsList.length === 0 ? <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontFamily: 'inherit' }}>Договоры не найдены.</div> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  {contractsList.map((doc, i) => (
                                    <div key={i} style={{ border: '1px solid #e1e1e1', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#333', fontFamily: 'inherit' }}>
                                      <div>
                                        <div style={{ fontWeight: 'bold' }}>{doc.name || 'Без названия'}</div>
                                        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Статус: {doc.status || 'Действует'}</div>
                                      </div>
                                      <button type="button" onClick={() => handleDownloadPdf(doc.id, doc.number)} disabled={isSubmitting} style={{ padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid #d4d5d8', borderRadius: '4px', cursor: isSubmitting ? 'wait' : 'pointer', color: '#333', opacity: 1, fontFamily: 'inherit' }}>
                                        📄 В файлы (PDF)
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}

                          {view === 'create_dp' && (
                            <form id="create-dp-form" onSubmit={handleCreateDP}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontFamily: 'inherit' }}>
                                <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Номер договора</label><input type="text" value={dpForm.contract_number} onChange={e => setDpForm({...dpForm, contract_number: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} placeholder="Оставьте пустым для автогенерации"/></div>
                                <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Дата договора *</label><input required type="date" value={dpForm.contract_date} onChange={e => setDpForm({...dpForm, contract_date: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}/></div>
                                
                                <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Срок действия договора *</label><input required type="date" value={dpForm.contract_expiration_date} onChange={e => setDpForm({...dpForm, contract_expiration_date: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}/></div>
                                <div><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Срок поставки *</label><input required type="date" value={dpForm.delivery_date} onChange={e => setDpForm({...dpForm, delivery_date: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }}/></div>
                                
                                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#333' }}>Цена договора *</label><input required type="text" value={dpForm.contract_price} onChange={e => setDpForm({...dpForm, contract_price: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d4d5d8', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#333', fontFamily: 'inherit' }} /></div>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            
            {syncStatus !== 'not_found' && !isLoading && (
              <div style={{ borderTop: '1px solid #eee', paddingTop: '15px', marginTop: '15px', display: 'flex', justifyContent: 'space-between' }}>
                {view === 'list' ? (
                  <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '8px 16px', border: '1px solid #d4d5d8', background: 'white', borderRadius: '6px', cursor: 'pointer', color: '#333', opacity: 1, fontWeight: '500', fontFamily: 'inherit' }}>Закрыть</button>
                ) : (
                  <button type="button" onClick={() => { setView('list'); if (activeTab === 'signatory') setActiveTab('info'); }} style={{ padding: '8px 16px', border: '1px solid #d4d5d8', background: 'white', borderRadius: '6px', cursor: 'pointer', color: '#333', opacity: 1, fontWeight: '500', fontFamily: 'inherit' }}>Отмена</button>
                )}

                {activeTab === 'contracts' && view === 'list' && (
                  <button type="button" onClick={() => setView('create_dp')} style={{ padding: '10px 16px', border: 'none', background: '#32c861', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>+ Создать Договор Поставки</button>
                )}
                {activeTab === 'contracts' && view === 'create_dp' && (
                  <button type="submit" form="create-dp-form" disabled={isSubmitting} style={{ padding: '10px 24px', border: 'none', background: '#4c8bf7', color: 'white', borderRadius: '6px', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>Сохранить договор</button>
                )}
                {activeTab === 'signatory' && (
                  <button type="submit" form="signatory-form" disabled={isSubmitting} style={{ padding: '10px 24px', border: 'none', background: '#4c8bf7', color: 'white', borderRadius: '6px', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold', opacity: 1, fontFamily: 'inherit' }}>Сохранить подписанта</button>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
};

export default OneCCompanyButton;