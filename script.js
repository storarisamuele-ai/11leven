document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initModal();
    initRegistration();
    initFaq();
});

// Demo inventory (mirrors the real Supabase initial stock) and confirmed counter.
window.__11levenDemoShirts = {
    XS: 5,
    S: 10,
    M: 10,
    L: 15,
    XL: 6,
    XXL: 4,
    XXXL: 0
};
window.__11levenDemoConfirmed = 0;

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
let currentShirtAvailability = [];

function initNavigation() {
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.main-nav');
    const links = nav ? nav.querySelectorAll('a') : [];

    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    links.forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
}

function initModal() {
    const modal = document.getElementById('registration-modal');
    const triggers = document.querySelectorAll('[data-open-modal]');
    const closeControls = document.querySelectorAll('[data-close-modal]');
    let lastTrigger = null;

    if (!modal) return;

    triggers.forEach(trigger => {
        trigger.addEventListener('click', event => {
            event.preventDefault();
            lastTrigger = trigger;
            openModal();
        });
    });

    closeControls.forEach(control => {
        control.addEventListener('click', () => closeModal());
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
            closeModal();
        }
    });

    function openModal() {
        modal.hidden = false;
        modal.classList.add('is-open');
        document.body.classList.add('is-modal-open');

        loadShirtAvailability();
        resetCaptcha();

        const firstField = modal.querySelector('#first_name');
        if (firstField) firstField.focus();
    }

    function closeModal() {
        modal.classList.remove('is-open');
        modal.hidden = true;
        document.body.classList.remove('is-modal-open');

        if (lastTrigger) lastTrigger.focus();
    }
}

function getSupabaseClient() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;

    if (url && key && typeof supabase !== 'undefined' && !url.includes('your-project')) {
        return supabase.createClient(url, key);
    }

    if (url && url.includes('your-project') && typeof supabase !== 'undefined') {
        console.warn('Supabase URL is still the placeholder; using demo mode for local testing.');
    } else if (!url || !key) {
        console.warn('Supabase URL or key not configured; using demo mode for local testing.');
    }

    return null;
}

function isSupabaseConfigured() {
    return getSupabaseClient() !== null;
}

async function getShirtAvailability() {
    const client = getSupabaseClient();

    if (!client) {
        return SIZE_ORDER.map(size => ({
            size,
            quantity: window.__11levenDemoShirts[size] || 0
        }));
    }

    const { data, error } = await client.rpc('get_shirt_availability');

    if (error) {
        console.error('get_shirt_availability error:', error);
        throw new Error('Impossibile caricare la disponibilità delle taglie.');
    }

    if (!data) return [];

    if (Array.isArray(data)) {
        return data.map(item => ({
            size: String(item.size || item.shirt_size).toUpperCase().trim(),
            quantity: Number(item.quantity || item.available_quantity || item.qty || 0)
        }));
    }

    if (typeof data === 'object') {
        return Object.entries(data).map(([size, quantity]) => ({
            size: String(size).toUpperCase().trim(),
            quantity: Number(quantity)
        }));
    }

    return [];
}

function isShirtAvailable(size, availability = currentShirtAvailability) {
    const item = availability.find(i => i.size === size);
    return item ? item.quantity > 0 : false;
}

function renderShirtSizes(availability, preserveValue = true) {
    const select = document.getElementById('shirt_size');
    if (!select) return;

    currentShirtAvailability = availability;

    const previousValue = preserveValue ? select.value : '';
    const placeholder = select.querySelector('option[value=""]');

    select.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Seleziona taglia';
    defaultOption.disabled = true;
    defaultOption.selected = !previousValue;
    select.appendChild(defaultOption);

    let selectedRestored = false;

    SIZE_ORDER.forEach(size => {
        const item = availability.find(i => i.size === size);
        const quantity = item ? item.quantity : 0;

        // Never display XXXL because its stock is 0.
        if (size === 'XXXL' && quantity === 0) return;

        const option = document.createElement('option');
        option.value = size;
        option.textContent = `${size} · ${quantity > 0 ? `${quantity} disponibili` : 'ESAURITA'}`;
        option.disabled = quantity === 0;

        // Keep the user's previous selection visible, even if it is now sold out.
        if (previousValue && size === previousValue) {
            option.selected = true;
            selectedRestored = true;
            defaultOption.selected = false;
        }

        select.appendChild(option);
    });

    if (previousValue && !selectedRestored) {
        defaultOption.selected = true;
    }
}

async function loadShirtAvailability() {
    try {
        const availability = await getShirtAvailability();
        renderShirtSizes(availability);
    } catch (err) {
        console.error(err);
    }
}

function initCaptcha() {
    const container = document.getElementById('captcha-container');
    const tokenInput = document.getElementById('captcha_token');
    const siteKey = window.CAPTCHA_SITE_KEY;

    if (!container || !tokenInput) return;

    if (!siteKey) {
        container.style.display = 'none';
        return;
    }

    window.onCaptchaSuccess = token => {
        tokenInput.value = token || '';
        tokenInput.dispatchEvent(new Event('input', { bubbles: true }));
    };

    window.onCaptchaExpired = () => {
        tokenInput.value = '';
        tokenInput.dispatchEvent(new Event('input', { bubbles: true }));
    };

    window.onCaptchaLoaded = () => {
        if (typeof grecaptcha !== 'undefined' && container && siteKey) {
            grecaptcha.render(container, {
                sitekey: siteKey,
                callback: window.onCaptchaSuccess,
                'expired-callback': window.onCaptchaExpired
            });
        }
    };
}

function resetCaptcha() {
    const tokenInput = document.getElementById('captcha_token');
    if (tokenInput) tokenInput.value = '';

    if (typeof grecaptcha !== 'undefined' && window.CAPTCHA_SITE_KEY) {
        try {
            grecaptcha.reset();
        } catch (_) {
            // Widget may not be rendered yet.
        }
    }
}

function isEmailValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isFieldValid(field) {
    if (field.type === 'checkbox') {
        return field.checked;
    }
    if (field.type === 'radio') {
        const group = document.getElementsByName(field.name);
        return Array.from(group).some(radio => radio.checked);
    }
    if (field.id === 'email' || field.name === 'email' || field.type === 'email') {
        return field.value.trim() !== '' && isEmailValid(field.value.trim());
    }
    return field.value.trim() !== '';
}

function clearValidation(form, message) {
    form.querySelectorAll('.is-invalid').forEach(field => field.classList.remove('is-invalid'));
    if (message) {
        message.textContent = '';
        message.classList.remove('is-visible');
    }
}

async function callRegister(payload) {
    const client = getSupabaseClient();

    if (!client) {
        // Demo mode: in-memory, non-persistent fallback for local UI testing.
        if (window.CAPTCHA_SITE_KEY && !payload.captcha_token) {
            throw new Error('Completa la verifica prima di continuare.');
        }

        const size = payload.shirt_size;
        const sizeAvailable = (window.__11levenDemoShirts[size] || 0) > 0;

        if (window.__11levenDemoConfirmed >= 50 || !sizeAvailable) {
            if (!sizeAvailable && window.__11levenDemoConfirmed < 50) {
                throw new Error('La taglia selezionata è esaurita. Scegli un\'altra taglia.');
            }
            return { data: [{ registration_status: 'waitlist' }], error: null };
        }

        window.__11levenDemoConfirmed += 1;
        window.__11levenDemoShirts[size] -= 1;
        return { data: [{ registration_status: 'confirmed' }], error: null };
    }

    const siteKey = window.CAPTCHA_SITE_KEY;
    if (!siteKey) {
        throw new Error('CAPTCHA non configurato. Contatta l\'organizzatore.');
    }
    if (!payload.captcha_token) {
        throw new Error('Completa la verifica prima di continuare.');
    }

    const baseUrl = String(window.SUPABASE_URL).replace(/\/$/, '');
    const endpoint = window.REGISTER_ENDPOINT || `${baseUrl}/functions/v1/register`;

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': window.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
            ...payload,
            captcha_token: payload.captcha_token
        })
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
        const message = json.error || json.message || 'Registrazione fallita.';
        throw new Error(message);
    }

    return { data: json.data, error: null };
}

function isSoldOutError(message) {
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes('shirt') ||
           lower.includes('taglia') ||
           lower.includes('esaurita') ||
           lower.includes('sold out') ||
           lower.includes('non disponibile') ||
           lower.includes('size');
}

function initRegistration() {
    const form = document.getElementById('registration-form');
    const result = document.getElementById('registration-result');
    const stage = form ? form.closest('.registration-stage') : null;
    const submitBtn = document.getElementById('submit-btn');
    const message = document.getElementById('form-message');
    const registerAgain = document.getElementById('register-again');
    const emailField = document.getElementById('email');
    const shirtSelect = document.getElementById('shirt_size');

    if (!form || !stage) return;

    initCaptcha();
    loadShirtAvailability();

    form.addEventListener('submit', async event => {
        event.preventDefault();

        clearValidation(form, message);

        const required = Array.from(form.querySelectorAll('[required]'));
        let firstInvalid = null;

        required.forEach(field => {
            if (!isFieldValid(field)) {
                field.classList.add('is-invalid');
                if (!firstInvalid) firstInvalid = field;
            }
        });

        if (firstInvalid) {
            if (firstInvalid === emailField) {
                message.textContent = 'Inserisci un indirizzo email valido.';
            } else {
                message.textContent = 'Compila tutti i campi obbligatori.';
            }
            message.classList.add('is-visible');
            firstInvalid.focus();
            return;
        }

        const selectedSize = shirtSelect ? shirtSelect.value : '';
        if (selectedSize && !isShirtAvailable(selectedSize)) {
            message.textContent = 'La taglia selezionata è esaurita. Scegli un\'altra taglia.';
            message.classList.add('is-visible');
            await loadShirtAvailability();
            if (shirtSelect) shirtSelect.focus();
            return;
        }

        const captchaToken = document.getElementById('captcha_token')?.value || '';

        submitBtn.disabled = true;
        submitBtn.textContent = 'REGISTRAZIONE...';

        const payload = {
            first_name: form.first_name.value.trim(),
            last_name: form.last_name.value.trim(),
            email: form.email.value.trim(),
            shirt_size: form.shirt_size.value,
            participant_type: form.participant_type.value,
            privacy_consent: form.privacy_consent.checked,
            participation_consent: form.participation_consent.checked,
            marketing_consent: form.marketing_consent.checked,
            captcha_token: captchaToken
        };

        try {
            const { data, error } = await callRegister(payload);

            if (error) {
                throw new Error(error.message || 'Qualcosa è andato storto. Riprova.');
            }

            const status = data && data[0] ? data[0].registration_status : null;

            if (status !== 'confirmed' && status !== 'waitlist') {
                throw new Error('Risposta imprevista. Riprova.');
            }

            showResult(status);
            stage.classList.add('is-success');
            stage.scrollTop = 0;
            form.reset();
            resetCaptcha();
        } catch (err) {
            console.error(err);

            if (isSoldOutError(err.message)) {
                message.textContent = 'La taglia selezionata è esaurita. Scegli un\'altra taglia.';
                await loadShirtAvailability();
                if (shirtSelect) shirtSelect.focus();
            } else if (err.message.includes('Completa la verifica')) {
                message.textContent = 'Completa la verifica prima di continuare.';
            } else if (err.message.includes('email')) {
                message.textContent = 'Inserisci un indirizzo email valido.';
            } else {
                message.textContent = err.message || 'Qualcosa è andato storto. Riprova.';
            }

            message.classList.add('is-visible');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'REGISTRATI';
        }
    });

    form.addEventListener('input', event => {
        if (event.target.classList.contains('is-invalid')) {
            if (isFieldValid(event.target)) {
                event.target.classList.remove('is-invalid');
            }
        }
        if (message.classList.contains('is-visible') && form.querySelectorAll('.is-invalid').length === 0) {
            message.classList.remove('is-visible');
            message.textContent = '';
        }
    });

    if (registerAgain && result) {
        registerAgain.addEventListener('click', () => {
            stage.classList.remove('is-success');
            stage.scrollTop = 0;
            submitBtn.disabled = false;
            clearValidation(form, message);
            form.reset();
            resetCaptcha();
            loadShirtAvailability();
            const firstField = form.querySelector('#first_name');
            if (firstField) firstField.focus();
        });
    }
}

function initFaq() {
    // The `name="faq"` attribute already provides single-open behaviour in modern browsers.
    // This fallback ensures the same behaviour everywhere.
    const detailsList = document.querySelectorAll('.faq-item');
    detailsList.forEach(details => {
        details.addEventListener('toggle', () => {
            if (details.open) {
                detailsList.forEach(other => {
                    if (other !== details && other.open) {
                        other.open = false;
                    }
                });
            }
        });
    });
}

function showResult(status) {
    const title = document.getElementById('result-title');
    const subtitle = document.getElementById('result-subtitle');
    const statusEl = document.getElementById('result-status');
    const tagline = document.getElementById('result-tagline');

    if (status === 'confirmed') {
        title.classList.add('text-gradient');
        title.textContent = "YOU'RE IN!";
        subtitle.innerHTML = 'La tua registrazione a <strong class="brand-name">11LEVEN</strong> è stata ricevuta.';
        statusEl.textContent = 'CONFERMATO';
        statusEl.className = 'registration-result-status is-confirmed';
        tagline.textContent = '11 Years - Still in the game';
    } else {
        title.classList.remove('text-gradient');
        title.textContent = 'SEI IN LISTA.';
        subtitle.innerHTML = '<strong class="brand-name">11LEVEN</strong> ha raggiunto il numero massimo di partecipanti confermati.<br>La tua registrazione è stata aggiunta alla lista d\'attesa.';
        statusEl.textContent = 'LISTA D\'ATTESA';
        statusEl.className = 'registration-result-status is-waitlist';
        tagline.textContent = '11 Years - Still in the game';
    }
}
