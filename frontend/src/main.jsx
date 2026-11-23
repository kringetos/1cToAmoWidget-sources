import React from "react";
import ReactDOM from "react-dom/client";
import OneCIntegrationButton from "./components/OneCIntegrationButton";
import OneCCompanyButton from "./components/OneCCompanyButton";
import AdvancedSettings from "./components/AdvancedSettings";

const Widget = {
  render(self) {
    const systemArea = self.system ? self.system.area : "";
    
    // --- Извлекаем настройки для всех областей виджета ---
    let serverUrl = "", login1c = "", password1c = "";
    let dealButtonId = "", companyButtonId = ""; 
    let n8n = "", amo_token = ""; 
    let widgetCode = "";

    try {
      const settings = self.get_settings();
      if (settings) {
        serverUrl = settings.server_url || "";
        login1c = settings.login_1c || "";
        password1c = settings.password_1c || "";
        n8n = settings.n8n_url || "n8n.24tema.ru";
        amo_token = settings.Access_token_Amocrm || "";
        dealButtonId = settings.deal_button_field ? settings.deal_button_field.trim() : "";
        companyButtonId = settings.company_button_field ? settings.company_button_field.trim() : "";
        widgetCode = settings.widget_code || "";
      }
    } catch (e) {
      console.warn("Не удалось получить настройки amoCRM:", e);
    }

    // Если мы в полноэкранных "Расширенных настройках"
    if (systemArea === 'advanced_settings') {
      const workArea = document.getElementById('work-area-' + widgetCode) || document.querySelector('.widget-settings__desc-space');
      
      if (workArea) {
        workArea.innerHTML = '';
        const root = ReactDOM.createRoot(workArea);
        root.render(
          <React.StrictMode>
            <AdvancedSettings 
              serverUrlProp={serverUrl} 
              login1c={login1c} 
              password1c={password1c} 
              n8n={n8n} 
            />
          </React.StrictMode>
        );
      }
      return true; 
    }

    // --- Логика для карточек ---
    const mountComponentToField = (selector, ButtonComponent, buttonLabel, actionName = 'direct') => {
      const targetElement = document.querySelector(selector);
      if (!targetElement) return; 
      
      const uniqueClass = 'replaced-btn-' + selector.replace(/[^a-zA-Z0-9]/g, '');
      if (targetElement.nextElementSibling && targetElement.nextElementSibling.classList.contains(uniqueClass)) return;

      const reactContainer = document.createElement('div');
      reactContainer.className = uniqueClass;
      reactContainer.style.marginBottom = '15px'; 

      targetElement.style.setProperty('display', 'none', 'important');
      targetElement.classList.add('amo-hidden-by-widget');
      targetElement.after(reactContainer);

      const root = ReactDOM.createRoot(reactContainer);
      root.render(
        <React.StrictMode>
          <ButtonComponent 
            label={buttonLabel} 
            serverUrl={serverUrl}
            login1c={login1c}
            password1c={password1c}
            n8n={n8n}
            amo_token={amo_token}
            actionName={actionName} 
            isMock={actionName !== 'direct'} 
          />
        </React.StrictMode>
      );
    };

    const mountAllButtons = () => {
      // --- СДЕЛКИ ---
      if (dealButtonId) {
        const dealSelector = `[data-id="${dealButtonId}"], [id^="cf_field_${dealButtonId}"]`;
        mountComponentToField(dealSelector, OneCIntegrationButton, '1С', 'direct');
      }

      // --- КОМПАНИИ ---
      if (companyButtonId) {
        const companySelector = `[data-id="${companyButtonId}"], [id^="cf_field_${companyButtonId}"]`;
        mountComponentToField(companySelector, OneCCompanyButton, '1С', 'direct');
      }
    };

    if (window.amo1cWidgetInterval) clearInterval(window.amo1cWidgetInterval);
    window.amo1cWidgetInterval = setInterval(mountAllButtons, 500);

    return true;
  },
  init() { return true; },
  bind_actions() { return true; },
  settings() { return true; },
  onSave() { return true; },
  destroy() { 
    if (window.amo1cWidgetInterval) clearInterval(window.amo1cWidgetInterval);
    return true; 
  },
};

export default Widget;