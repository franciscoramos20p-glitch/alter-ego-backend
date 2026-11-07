// INICIO DE IMPORTACIONES //
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import crypto from 'crypto';
import os from 'os';
// FINAL DE IMPORTACIONES //

// =================================================================
// 🚨 CAZADORES DE ERRORES GLOBALES PARA LA TERMINAL DE RENDER 🚨
// =================================================================
// INICIO DE MANEJO DE ERRORES GLOBALES //
process.on('uncaughtException', (err) => {
    console.error('🚨 [ERROR CRÍTICO NO ATRAPADO]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 [PROMESA RECHAZADA NO MANEJADA]:', reason);
});
// FINAL DE MANEJO DE ERRORES GLOBALES //

// INICIO DE CONFIGURACIÓN INICIAL //
dotenv.config();
const PORT = process.env.PORT || 8080;
// FINAL DE CONFIGURACIÓN INICIAL //

// 🔥 CONFIGURACIÓN FIREBASE ADMIN 🔥
// INICIO DE FIREBASE ADMIN //
if (!admin.apps.length) {
    try {
        const envVar = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (!envVar) {
            console.error("❌ ALERTA CRÍTICA: La variable FIREBASE_SERVICE_ACCOUNT no existe o está vacía.");
        } else {
            const serviceAccount = JSON.parse(envVar);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'
            });
            console.log("✅ Firebase Admin inicializado correctamente.");
        }
    } catch (error) {
        console.error("❌ ERROR parseando el JSON de Firebase:", error.message);
    }
}
// FINAL DE FIREBASE ADMIN //

// INICIO DE CONFIGURACIÓN EXPRESS //
const app = express();
app.use(bodyParser.json()); 

app.get('/', (req, res) => {
    res.status(200).send('Servidor AlterEgo Activo 🚀\n');
});
// FINAL DE CONFIGURACIÓN EXPRESS //

// =================================================================
// 💰 WEBHOOK DE REVENUECAT (EL VERDUGO)
// =================================================================
// INICIO DE WEBHOOK REVENUECAT //
app.post('/webhook-revenuecat', async (req, res) => {
    const expectedToken = process.env.RC_WEBHOOK_AUTH || "AlterEgo_Secreto_Webhook_2026";
    if (req.headers.authorization !== expectedToken) {
        console.warn("🚨 [SEGURIDAD] Intento de acceso no autorizado al Webhook.");
        return res.status(401).send('No autorizado');
    }

    res.status(200).send('Webhook recibido');
    
    try {
        const event = req.body.event;
        if (!event || event.type === 'TEST') {
            console.log("ℹ️ [Webhook] Evento de prueba recibido y omitido.");
            return; 
        }

        const eventType = event.type;
        let userId = event.app_user_id;

        if (eventType === 'TRANSFER' && event.transferred_to && event.transferred_to.length > 0) {
            userId = event.transferred_to[0]; 
        }

        if (!userId) {
            console.log("⚠️ [Webhook] Evento recibido sin app_user_id. Omitiendo.");
            return;
        }

        if (userId.startsWith('$RCAnonymousID')) {
            console.log(`👻 [Webhook] Ignorando evento de usuario anónimo en Sandbox: ${userId}`);
            return;
        }

        const safeUserId = userId.replace(/[.$#\[\]]/g, "_");
        const userRef = admin.database().ref(`users/${safeUserId}`);

        console.log(`🔔 [Webhook] Evento: ${eventType} | Usuario: ${safeUserId}`);

        if (eventType === "INITIAL_PURCHASE" || eventType === "RENEWAL" || eventType === "PRODUCT_CHANGE") {
            await userRef.update({ isPro: true, pro_updated_at: Date.now() });
            console.log(`✅ [RevenueCat] ${safeUserId} es PRO.`);
        } 
        else if (eventType === "TRANSFER") {
            if (event.transferred_from && event.transferred_from.length > 0) {
                const oldUserId = event.transferred_from[0];
                const safeOldUserId = oldUserId.replace(/[.$#\[\]]/g, "_");
                
                if (!oldUserId.startsWith('$RCAnonymousID')) {
                    await admin.database().ref(`users/${safeOldUserId}`).update({ isPro: false, pro_updated_at: Date.now() });
                }
                await userRef.update({ isPro: true, pro_updated_at: Date.now() });
                console.log(`🔄 [RevenueCat] VIP movido de (${safeOldUserId}) a (${safeUserId})`);
            } else {
                await userRef.update({ isPro: true, pro_updated_at: Date.now() });
            }
        }
        else if (eventType === "EXPIRATION") {
             await userRef.update({ isPro: false, pro_updated_at: Date.now() });
             console.log(`❌ [RevenueCat] ${safeUserId} perdió el PRO (Expiración).`);
        }
        else if (eventType === "CANCELLATION") {
             if (event.cancel_reason === "CUSTOMER_SUPPORT" || 
                 event.cancel_reason === "BILLING_ERROR" || 
                 event.cancel_reason === "FRAUD" || 
                 event.cancel_reason === "DEVELOPER_INITIATED") { 
                 
                 const productId = event.product_id || "";
                 
                 // 1. Identificamos si es un paquete de créditos y sus valores por defecto (por si Firebase falla)
                 const defaultCredits = {
                     'starter_10_pack': 25,
                     'basic_30_pack': 180,
                     'pro_60_pack': 450,
                     'ultra_120_pack': 1000
                 };

                 if (defaultCredits[productId] !== undefined) {
                     // 2. Buscamos los créditos dinámicos REALES en Firebase
                     let realCredits = defaultCredits[productId];
                     try {
                         const res = await fetch(`https://alteregodb-1b8f3-default-rtdb.firebaseio.com/dynamic_config/packages.json`);
                         const firebaseData = await res.json();
                         if (firebaseData && firebaseData[productId] && firebaseData[productId].credits) {
                             realCredits = firebaseData[productId].credits;
                         }
                     } catch (err) {
                         console.error("🚨 [Webhook] Error leyendo dynamic_config, usando default:", err);
                     }

                     // 3. Multiplicamos por 60 (igual que en tu Paywall)
                     const unitsToRevoke = realCredits * 60;

                     const snapshot = await userRef.once('value');
                     const userData = snapshot.val() || {};
                     let currentCredits = parseFloat(userData.credits) || 0;
                     
                     // 4. Le restamos las unidades. Si da negativo, Firebase guarda el negativo.
                     let newBalance = currentCredits - unitsToRevoke;
                     
                     await userRef.update({ credits: newBalance });
                     console.log(`🚨 [RevenueCat] REEMBOLSO: Se quitaron ${unitsToRevoke} unidades (${realCredits} créditos) a ${safeUserId}. Saldo actual: ${newBalance}`);
                 } else {
                     // Si no es ninguno de los 4 paquetes, asumimos que es la suscripción PRO
                     await userRef.update({ isPro: false, pro_updated_at: Date.now() }); 
                     console.log(`❌ [RevenueCat] VIP revocado a ${safeUserId} (Motivo: ${event.cancel_reason}).`);
                 }
             } else {
                 console.log(`ℹ️ [RevenueCat] ${safeUserId} apagó la auto-renovación.`);
             }
        }

    } catch (error) {
        console.error("🚨 [ERROR EN WEBHOOK]:", error);
    }
});

app.use((err, req, res, next) => {
    console.error('🚨 [ERROR DE EXPRESS]:', err.stack);
    res.status(500).send('Error interno del servidor.');
});
// FINAL DE WEBHOOK REVENUECAT //

// INICIO DE INICIALIZACIÓN DE SERVIDOR Y APIS //
const server = app.listen(PORT, () => {
    console.log(`🏆 SERVIDOR V170 (LIVE INTACTO + PRONUNCIATION): Puerto: ${PORT}`);
});

const wss = new WebSocketServer({ server });

const RENDER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; 
setInterval(() => {
    fetch(RENDER_URL).catch(() => {});
}, 600000);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // 🔥 AÑADIDA PARA PRONUNCIACIÓN 🔥

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 
const LIVE_SECRET_KEY = "ALTER_LIVE_SECRET_2026"; 
// FINAL DE INICIALIZACIÓN DE SERVIDOR Y APIS //

// 🔥 INICIO DE LISTAS DE VOCES IA 🔥
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const DEEPGRAM_VOICES = [
    'aura-asteria-en', 'aura-luna-en', 'aura-orion-en', 
    'aura-luna-es', 'aura-orion-es', 'aura-2-alvaro-es', 'aura-2-carina-es', 
    'aura-2-hector-fr', 'aura-2-agathe-fr', 
    'aura-2-fabian-de', 'aura-2-aurelia-de', 
    'aura-2-cesare-it', 'aura-2-cinzia-it', 
    'aura-2-beatrix-nl', 'aura-2-ebisu-ja', 'aura-2-ama-ja'
];
const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'];
// 🔥 FINAL DE LISTAS DE VOCES IA 🔥

// INICIO DE LISTA DE IDIOMAS GLOBALES //
const LANGUAGES = [
    { code: 'es', name: 'Español', serverName: 'Spanish' },
    { code: 'en', name: 'Inglés', serverName: 'English' },
    { code: 'fr', name: 'Francés', serverName: 'French' },
    { code: 'de', name: 'Alemán', serverName: 'German' },
    { code: 'it', name: 'Italiano', serverName: 'Italian' },
    { code: 'pt-BR', name: 'Portugués (BR)', serverName: 'Portuguese (Brazil)' },
    { code: 'zh-CN', name: 'Chino (Simpl)', serverName: 'Chinese (Simplified)' },
    { code: 'ja', name: 'Japonés', serverName: 'Japanese' },
    { code: 'ko', name: 'Coreano', serverName: 'Korean' },
    { code: 'ru', name: 'Ruso', serverName: 'Russian' },
    { code: 'ar', name: 'Árabe', serverName: 'Arabic' },
    { code: 'hi', name: 'Hindi', serverName: 'Hindi' },
    { code: 'pt-PT', name: 'Portugués (EU)', serverName: 'Portuguese (Portugal)' },
    { code: 'nl', name: 'Holandés', serverName: 'Dutch' },
    { code: 'tr', name: 'Turco', serverName: 'Turkish' },
    { code: 'pl', name: 'Polaco', serverName: 'Polish' },
    { code: 'sv', name: 'Sueco', serverName: 'Swedish' },
    { code: 'uk', name: 'Ucraniano', serverName: 'Ukrainian' },
    { code: 'da', name: 'Danés', serverName: 'Danish' },
    { code: 'no', name: 'Noruego', serverName: 'Norwegian' },
    { code: 'fi', name: 'Finlandés', serverName: 'Finnish' },
    { code: 'el', name: 'Griego', serverName: 'Greek' },
    { code: 'cs', name: 'Checo', serverName: 'Czech' },
    { code: 'hu', name: 'Húngaro', serverName: 'Hungarian' },
    { code: 'ro', name: 'Rumano', serverName: 'Romanian' },
    { code: 'ca', name: 'Catalán', serverName: 'Catalan' },
    { code: 'eu', name: 'Euskera', serverName: 'Basque' },
    { code: 'gl', name: 'Gallego', serverName: 'Galician' },
    { code: 'hr', name: 'Croata', serverName: 'Croatian' },
    { code: 'sr', name: 'Serbio', serverName: 'Serbian' },
    { code: 'sk', name: 'Eslovaco', serverName: 'Slovak' },
    { code: 'sl', name: 'Esloveno', serverName: 'Slovenian' },
    { code: 'bg', name: 'Búlgaro', serverName: 'Bulgarian' },
    { code: 'et', name: 'Estonio', serverName: 'Estonian' },
    { code: 'lv', name: 'Letón', serverName: 'Latvian' },
    { code: 'lt', name: 'Lituano', serverName: 'Lithuanian' },
    { code: 'is', name: 'Islandés', serverName: 'Icelandic' },
    { code: 'ga', name: 'Irlandés', serverName: 'Irish' },
    { code: 'cy', name: 'Galés', serverName: 'Welsh' },
    { code: 'mt', name: 'Maltés', serverName: 'Maltese' },
    { code: 'sq', name: 'Albanés', serverName: 'Albanian' },
    { code: 'mk', name: 'Macedonio', serverName: 'Macedonian' },
    { code: 'bs', name: 'Bosnio', serverName: 'Bosnian' },
    { code: 'be', name: 'Bielorruso', serverName: 'Belarusian' },
    { code: 'lb', name: 'Luxemburgués', serverName: 'Luxembourgish' },
    { code: 'zh-TW', name: 'Chino (Trad)', serverName: 'Chinese (Traditional)' },
    { code: 'th', name: 'Tailandés', serverName: 'Thai' },
    { code: 'vi', name: 'Vietnamita', serverName: 'Vietnamese' },
    { code: 'id', name: 'Indonesio', serverName: 'Indonesian' },
    { code: 'ms', name: 'Malayo', serverName: 'Malay' },
    { code: 'tl', name: 'Filipino', serverName: 'Tagalog' },
    { code: 'my', name: 'Birmano', serverName: 'Burmese' },
    { code: 'km', name: 'Jemer', serverName: 'Khmer' },
    { code: 'lo', name: 'Laosiano', serverName: 'Lao' },
    { code: 'ne', name: 'Nepalí', serverName: 'Nepali' },
    { code: 'si', name: 'Cingalés', serverName: 'Sinhala' },
    { code: 'mn', name: 'Mongol', serverName: 'Mongolian' },
    { code: 'kk', name: 'Kazajo', serverName: 'Kazakh' },
    { code: 'uz', name: 'Uzbeko', serverName: 'Uzbek' },
    { code: 'ky', name: 'Kirguís', serverName: 'Kyrgyz' },
    { code: 'tg', name: 'Tayiko', serverName: 'Tajik' },
    { code: 'he', name: 'Hebreo', serverName: 'Hebrew' },
    { code: 'fa', name: 'Persa (Farsi)', serverName: 'Persian' },
    { code: 'ps', name: 'Pastún', serverName: 'Pashto' },
    { code: 'ku', name: 'Kurdo', serverName: 'Kurdish' },
    { code: 'hy', name: 'Armenio', serverName: 'Armenian' },
    { code: 'az', name: 'Azerí', serverName: 'Azerbaijani' },
    { code: 'ka', name: 'Georgiano', serverName: 'Georgian' },
    { code: 'bn', name: 'Bengalí', serverName: 'Bengali' },
    { code: 'pa', name: 'Punyabí', serverName: 'Punjabi' },
    { code: 'ta', name: 'Tamil', serverName: 'Tamil' },
    { code: 'te', name: 'Telugu', serverName: 'Telugu' },
    { code: 'mr', name: 'Maratí', serverName: 'Marathi' },
    { code: 'ur', name: 'Urdu', serverName: 'Urdu' },
    { code: 'gu', name: 'Guyaratí', serverName: 'Gujarati' },
    { code: 'kn', name: 'Canarés', serverName: 'Kannada' },
    { code: 'ml', name: 'Malayalam', serverName: 'Malayalam' },
    { code: 'sw', name: 'Suajili', serverName: 'Swahili' },
    { code: 'am', name: 'Amárico', serverName: 'Amharic' },
    { code: 'so', name: 'Somalí', serverName: 'Somali' },
    { code: 'zu', name: 'Zulú', serverName: 'Zulu' },
    { code: 'xh', name: 'Xhosa', serverName: 'Xhosa' },
    { code: 'af', name: 'Afrikáans', serverName: 'Afrikaans' },
    { code: 'yo', name: 'Yoruba', serverName: 'Yoruba' },
    { code: 'ig', name: 'Igbo', serverName: 'Igbo' },
    { code: 'ha', name: 'Hausa', serverName: 'Hausa' },
    { code: 'ht', name: 'Criollo Haitiano', serverName: 'Haitian Creole' },
    { code: 'gn', name: 'Guaraní', serverName: 'Guarani' },
    { code: 'qu', name: 'Quechua', serverName: 'Quechua' },
    { code: 'eo', name: 'Esperanto', serverName: 'Esperanto' },
    { code: 'la', name: 'Latín', serverName: 'Latin' },
    { code: 'mg', name: 'Malgache', serverName: 'Malagasy' },
    { code: 'mi', name: 'Maorí', serverName: 'Maori' },
    { code: 'sm', name: 'Samoano', serverName: 'Samoan' },
    { code: 'haw', name: 'Hawaiano', serverName: 'Hawaiian' },
    { code: 'jw', name: 'Javanés', serverName: 'Javanese' },
    { code: 'su', name: 'Sundanés', serverName: 'Sundanese' },
    { code: 'yi', name: 'Yidis', serverName: 'Yiddish' }
];

const WHISPER_LANGUAGES = [
    'pt-BR', 'zh-CN', 'ar', 'pt-PT', 'eu', 'gl', 'hr', 'sr', 'is', 'ga', 'cy', 'mt', 'sq', 'mk', 'bs', 'be', 'lb', 'zh-TW', 
    'tl', 'my', 'km', 'lo', 'ne', 'si', 'mn', 'kk', 'uz', 'ky', 'tg', 'he', 'fa', 'ps', 'ku', 'hy', 'az', 'ka', 'bn', 'pa', 
    'ta', 'te', 'mr', 'ur', 'gu', 'kn', 'ml', 'sw', 'am', 'so', 'zu', 'xh', 'af', 'yo', 'ig', 'ha', 'ht', 'gn', 'qu', 'eo', 
    'la', 'mg', 'mi', 'sm', 'haw', 'jw', 'su', 'yi'
];

const WHISPER_HALLUCINATIONS = [
    "subtítulos", "subtitulos", "amara.org", "gracias por ver", "thanks for watching", 
    "suscríbete", "subscribe", "♪", "🎵", "🎶", "[música]", "(música)", "[music]", "(music)",
    "[silencio]", "(silencio)", "traducido por", "translated by", "youtu.be", ".com", 
    "www.", "televisión española", "derechos de autor", "copyright", "subtítulos realizados",
    "subs by", "amara", "subs:", "subtítulos:", "si hay silencio", "devuelve un texto", "vacío",
    "如果没有声音", "如果没有声音", "返回空文本", "if there is no clear human speech", "empty string",
    "el asiento ahora es impecable", "cámara de diputados", "república de chile", "de cierta manera"
];
// FINAL DE LISTA DE IDIOMAS GLOBALES //


// INICIO DE FUNCIONES AUXILIARES //
function getLangCode(serverName) {
    if (!serverName) return 'en';
    const found = LANGUAGES.find(l => l.serverName.toLowerCase() === String(serverName).toLowerCase());
    return found ? found.code : 'en';
}

function sanitizeAiResponse(text) {
    if (!text) return "";
    let clean = text;
    clean = clean.replace(/(\*|\[|\()?(laughs|sighs|chuckles|giggles|smiles|groans|clears throat|pauses)(\*|\]|\))?/gi, "");
    clean = clean.replace(/\*\*/g, "").replace(/\*/g, "");
    clean = clean.replace(/Translation:/gi, "").replace(/Translated text:/gi, "");
    clean = clean.replace(/^["']|["']$/g, "");
    clean = clean.replace(/<([^>]+)>/g, "$1");
    return clean.trim();
}

function safeSend(ws, payload) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
    }
}

// 🔥 Avisa al cliente que no hubo resultado para que NUNCA se quede "procesando" para siempre.
// Usamos 'error_audio_empty' porque todas las versiones de la app ya lo entienden.
function sendEmptyResult(ws, reason = 'empty') {
    safeSend(ws, { type: 'error_audio_empty', reason });
}

async function deductCreditsFromFirebase(userId, cost) {
    if (!userId || !(cost > 0)) return;
    try {
        const safeId = String(userId).replace(/[.$#\[\]]/g, "_");
        const userRef = admin.database().ref(`users/${safeId}/credits`);
        // Transacción atómica: evita que dos cobros simultáneos se pisen
        await userRef.transaction((current) => (parseFloat(current) || 0) - cost);
        console.log(`📉 [Cobro] Se cobraron ${cost} uds a ${safeId}.`);
    } catch (e) {
        console.error("🚨 [ERROR FIREBASE COBRO]:", e.message);
    }
}

// 🔥 DETECTA EL IDIOMA DEL TEXTO TRADUCIDO PARA EL MOTOR DE VOZ
function detectLanguageServer(text, codeA, codeB) {
    if (!text) return codeA;
    const lowerText = text.toLowerCase();

    const isAsian = /[一-龥぀-ヿ가-힯]/.test(lowerText);
    const isCyrillic = /[Ѐ-ӿ]/.test(lowerText);
    const isArabic = /[؀-ۿ]/.test(lowerText);

    const checkScript = (code) => {
        const p = code.split('-')[0];
        if (['zh', 'ja', 'ko'].includes(p)) return isAsian;
        if (['ru', 'uk', 'bg', 'be', 'sr', 'mk', 'kk', 'ky', 'tg', 'mn'].includes(p)) return isCyrillic;
        if (['ar', 'fa', 'ur', 'ps', 'ku'].includes(p)) return isArabic;
        return false;
    };

    if (checkScript(codeA) && !checkScript(codeB)) return isAsian || isCyrillic || isArabic ? codeA : codeB;
    if (checkScript(codeB) && !checkScript(codeA)) return isAsian || isCyrillic || isArabic ? codeB : codeA;

    const hasSpanish = /[áéíóúñ¿¡]/i.test(lowerText);
    const hasFrench = /[éàèùâêîôûçëïü]/i.test(lowerText);
    const hasGerman = /[äöüß]/i.test(lowerText);

    const pA = codeA.split('-')[0];
    const pB = codeB.split('-')[0];

    if (hasSpanish) { if (pA === 'es') return codeA; if (pB === 'es') return codeB; }
    if (hasFrench) { if (pA === 'fr') return codeA; if (pB === 'fr') return codeB; }
    if (hasGerman) { if (pA === 'de') return codeA; if (pB === 'de') return codeB; }

    const words = lowerText.replace(/[^\w\sáéíóúñàèìòùâêîôûäöüßãõç]/gi, '').split(/\s+/);

    const dict = {
        en: ['the', 'is', 'are', 'you', 'how', 'what', 'why', 'where', 'when', 'who', 'this', 'that', 'it', 'to', 'and', 'of', 'in', 'on', 'for', 'with', 'as', 'do', 'will', 'can', 'my', 'your', 'we', 'they', 'he', 'she', 'but', 'not', 'i', 'more', 'less', 'well', 'still', 'work', 'hello'],
        es: ['el', 'la', 'los', 'las', 'un', 'una', 'es', 'son', 'tú', 'tu', 'como', 'qué', 'por', 'donde', 'cuando', 'quien', 'este', 'esto', 'ese', 'eso', 'a', 'y', 'de', 'en', 'para', 'con', 'hacer', 'poder', 'mi', 'su', 'nosotros', 'ellos', 'él', 'ella', 'pero', 'no', 'mas', 'hola', 'bien', 'sigue', 'sin', 'funcionar', 'menos', 'o'],
    };

    let scoreA = 0; let scoreB = 0;
    const listA = dict[pA] || []; const listB = dict[pB] || [];

    for (let w of words) {
        if (listA.includes(w)) scoreA++;
        if (listB.includes(w)) scoreB++;
    }

    if (scoreA > scoreB) return codeA;
    if (scoreB > scoreA) return codeB;

    return codeA;
}

// 🔊 Selecciona la voz Deepgram correcta según idioma y género
function pickDeepgramVoice(langCode, isMale) {
    const tLang = String(langCode || 'en').substring(0, 2).toLowerCase();
    if (tLang === 'en') return isMale ? "aura-orion-en" : "aura-asteria-en";
    if (tLang === 'es') return isMale ? "aura-2-alvaro-es" : "aura-2-carina-es";
    if (tLang === 'fr') return isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr";
    if (tLang === 'de') return isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de";
    if (tLang === 'it') return isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it";
    if (tLang === 'nl') return "aura-2-beatrix-nl";
    if (tLang === 'ja') return isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja";
    return null; // Idioma no soportado por Deepgram
}

async function ttsDeepgram(text, voiceModel) {
    if (!text || !voiceModel) return null;
    try {
        const dRes = await fetch(`https://api.deepgram.com/v1/speak?model=${voiceModel}`, {
            method: "POST",
            headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        if (!dRes.ok) return null;
        return Buffer.from(await dRes.arrayBuffer()).toString('base64');
    } catch (e) { return null; }
}

async function ttsOpenAI(text, voice, speed = 1) {
    if (!text) return null;
    try {
        const validVoice = OPENAI_VOICES.includes(voice) ? voice : 'nova';
        const oRes = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "tts-1", input: text, voice: validVoice, speed: Math.min(4, Math.max(0.25, Number(speed) || 1)) })
        });
        if (!oRes.ok) return null;
        return Buffer.from(await oRes.arrayBuffer()).toString('base64');
    } catch (e) { return null; }
}

function cleanTextForSpeech(text) {
    return String(text || '')
        .replace(/~~~.*?~~~/g, '')
        .replace(/\|\|\|/g, ' ')
        .replace(/###/g, '')
        .replace(/\[.*?\]\s*/g, '')
        .replace(/["']/g, '')
        .trim();
}

// Convierte el historial que manda la app en mensajes válidos para el LLM
function buildHistoryMessages(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(-8)
        .filter(m => m && typeof m.text === 'string' && m.text.trim())
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text.slice(0, 2000) }));
}

async function streamCompletion(messages, temperature, maxTokens) {
    let stream;
    try {
        stream = await groq.chat.completions.create({
            messages, model: "llama-3.3-70b-versatile", temperature, max_tokens: maxTokens, stream: true
        });
    } catch (groqError) {
        console.warn("⚠️ [Groq] Falló, usando OpenAI:", groqError.message);
        stream = await openai.chat.completions.create({
            messages, model: "gpt-4o-mini", temperature, max_tokens: maxTokens, stream: true
        });
    }
    let aiText = "";
    for await (const chunk of stream) { aiText += chunk.choices[0]?.delta?.content || ""; }
    return sanitizeAiResponse(aiText);
}

function liveSystemPrompt(langNameA, langNameB) {
    return `You are an expert, machine-like bilingual translation API strictly limited to ${langNameA} and ${langNameB}.
CRITICAL RULES:
1. If the input is in ${langNameA}, translate ONLY to ${langNameB}.
2. If the input is in ${langNameB}, translate ONLY to ${langNameA}.
3. If the input is in ANY OTHER LANGUAGE, assume they meant to speak in ${langNameA} and translate it to ${langNameB}.
4. OUTPUT ONLY THE EXACT TRANSLATION. NO CONVERSATIONAL TEXT, NO EXPLANATIONS, NO QUOTES.`;
}

// Genera traducción + pronunciación + audio premium y responde al cliente
async function respondWithTranslation(ws, data, userText, ctx) {
    const { langNameA, langNameB, codeA, codeB, isFreeMode } = ctx;
    const isLive = data.live_key === LIVE_SECRET_KEY;

    const messages = [{
        role: "system",
        content: isLive
            ? liveSystemPrompt(langNameA, langNameB)
            : (data.tone || `You are a strict bidirectional translator between ${langNameA} and ${langNameB}. If input is in ${langNameA}, translate to ${langNameB}. If input is in ${langNameB}, translate to ${langNameA}. OUTPUT ONLY TRANSLATED TEXT. NO CONVERSATION.`)
    }];
    // El historial solo aplica a modos conversacionales (simulador), nunca al intérprete Live
    if (!isLive && data.simulator_key) messages.push(...buildHistoryMessages(data.history));
    messages.push({ role: "user", content: userText });

    // Los textos largos (modo VIP) necesitan más tokens de salida
    const maxTokens = Math.min(4000, Math.max(250, Math.ceil(userText.length / 2)));
    const aiText = await streamCompletion(messages, 0.0, data.simulator_key ? Math.max(maxTokens, 350) : maxTokens);
    if (!aiText) { sendEmptyResult(ws, 'no_translation'); return; }

    console.log(`🧠 [Respuesta IA]: "${aiText.slice(0, 200)}"`);

    const finalOutputLang = detectLanguageServer(aiText, codeA, codeB);

    // 🔥 PRONUNCIACIÓN (SOLO CLASSIC SCREEN) — en paralelo con el audio
    const pronunciationPromise = (data.wants_pronunciation && !isLive)
        ? getPronunciation(aiText, (finalOutputLang === codeA) ? langNameB : langNameA)
        : Promise.resolve(null);

    let audioPromise = Promise.resolve(null);
    if (!isFreeMode && isLive) {
        const activeVoice = finalOutputLang === codeA
            ? (data.myVoice || { provider: 'native', id: 'native' })
            : (data.targetVoice || { provider: 'native', id: 'native' });
        if (activeVoice.provider === 'deepgram') {
            const dVoice = pickDeepgramVoice(finalOutputLang, activeVoice.id === 'premium_male' || /orion|alvaro|hector|fabian|cesare|ebisu/.test(activeVoice.id || ''));
            audioPromise = ttsDeepgram(cleanTextForSpeech(aiText), dVoice);
        }
    } else if (!isLive && data.simulator_key && (data.voice_engine === 'openai' || data.voice_engine === 'deepgram')) {
        const speechText = cleanTextForSpeech(aiText);
        if (data.voice_engine === 'deepgram') {
            audioPromise = ttsDeepgram(speechText, pickDeepgramVoice(codeB, false))
                .then(a => a || ttsOpenAI(speechText, data.openai_voice, data.speed));
        } else {
            audioPromise = ttsOpenAI(speechText, data.openai_voice, data.speed);
        }
    }

    const [finalPronunciation, base64Audio] = await Promise.all([pronunciationPromise, audioPromise]);

    safeSend(ws, { type: 'full_response', user_text: userText, ai_text: aiText, detected_lang: finalOutputLang, audio: base64Audio, pronunciation: finalPronunciation });
}

async function transcribeAudio(audioBuffer, codeA, codeB) {
    const useWhisper = WHISPER_LANGUAGES.includes(codeA) || WHISPER_LANGUAGES.includes(codeB);

    const whisper = async () => {
        const randomId = crypto.randomBytes(4).toString('hex');
        const tempFilePath = path.join(os.tmpdir(), `alterego_${Date.now()}_${randomId}.m4a`);
        await fs.promises.writeFile(tempFilePath, audioBuffer);
        try {
            const r = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                prompt: "Do not transcribe silence. Only output spoken words clearly.",
                temperature: 0.0
            });
            return (r.text || '').trim();
        } finally {
            fs.promises.unlink(tempFilePath).catch(() => {});
        }
    };

    if (useWhisper) return whisper();

    try {
        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            audioBuffer, { model: "nova-2", detect_language: [codeA, codeB], smart_format: true, punctuate: true, utterances: true, mimetype: 'audio/mp4' }
        );
        if (error) throw new Error("Deepgram devolvió un error");
        return (result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
    } catch (deepgramError) {
        return whisper();
    }
}

function isHallucination(text) {
    if (!text) return true;
    const textLower = text.toLowerCase();
    if (WHISPER_HALLUCINATIONS.some(h => textLower.includes(h))) return true;
    if (text.length <= 2 && !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ一-龥぀-ヿ가-힯Ѐ-ӿ]/.test(text)) return true;
    return false;
}
// FINAL DE FUNCIONES AUXILIARES //

// INICIO DE INTERVALO MANTENIMIENTO WEBSOCKET //
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));
// FINAL DE INTERVALO MANTENIMIENTO WEBSOCKET //

// 🛡️ Limitador por conexión: ventana deslizante (no descarta mensajes legítimos seguidos como auth + texto)
const RATE_WINDOW_MS = 10000;
const RATE_MAX_MSGS = 40;
const MAX_IMAGE_BASE64 = 12 * 1024 * 1024; // ~9MB de imagen
const MAX_AUDIO_BASE64 = 15 * 1024 * 1024;

// =================================================================
// 🚀 INICIO DE CONEXIÓN WEBSOCKET PRINCIPAL 🚀
// =================================================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.msgTimestamps = [];
    ws.userId = null;

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', (err) => console.warn('⚠️ [WS] Error de socket:', err.message));

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            ws.msgTimestamps = ws.msgTimestamps.filter(t => now - t < RATE_WINDOW_MS);
            if (ws.msgTimestamps.length >= RATE_MAX_MSGS) {
                console.warn('🚦 [Rate limit] Mensaje descartado');
                sendEmptyResult(ws, 'rate_limited');
                return;
            }
            ws.msgTimestamps.push(now);

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }
            if (!data || typeof data !== 'object') return;

            // 🔐 AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                let realCredits = 0;
                if (data.user_id) {
                    ws.userId = String(data.user_id).replace(/[.$#\[\]]/g, "_");
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${ws.userId}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) realCredits = parseFloat(userData.credits);
                    } catch (err) {}
                }
                safeSend(ws, { type: 'auth_success', credits: realCredits });
                return;
            }

            // 🎙️ VISTA PREVIA / SALUDO (tts_request)
            if (data.type === 'tts_request') {
                if (data.voice_engine && data.voice_engine !== 'free' && data.voice_engine !== 'native') {
                    try {
                        if (ws.userId && data.cost && !data.is_preview) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                        const text = cleanTextForSpeech(data.text);
                        const requestedVoice = data.voice || data.openai_voice || 'nova';
                        let base64Audio = null;

                        if (DEEPGRAM_VOICES.includes(requestedVoice) || data.voice_engine === 'deepgram') {
                            const dVoice = DEEPGRAM_VOICES.includes(requestedVoice) ? requestedVoice : "aura-asteria-en";
                            base64Audio = await ttsDeepgram(text, dVoice);
                        }
                        if (!base64Audio && (OPENAI_VOICES.includes(requestedVoice) || data.voice_engine === 'openai')) {
                            base64Audio = await ttsOpenAI(text, requestedVoice, data.speed);
                        }
                        safeSend(ws, { type: 'full_response', user_text: null, ai_text: data.text, audio: base64Audio });
                    } catch (err) {
                        sendEmptyResult(ws, 'tts_failed');
                    }
                }
                return;
            }

            // ✍️ ANÁLISIS DE GRAMÁTICA
            if (data.type === 'analyze_grammar') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                try {
                    const prompt = `Eres un experto profesor de idiomas. Evalúa ÚNICAMENTE las frases del estudiante en esta conversación. Corrige y felicita.\n\n${data.text}`;
                    const completion = await openai.chat.completions.create({
                        messages: [{ role: "user", content: prompt }],
                        model: "gpt-4o-mini",
                        temperature: 0.5,
                        max_tokens: 500
                    });
                    safeSend(ws, { type: 'grammar_analysis_result', feedback: completion.choices[0]?.message?.content || "Análisis fallido." });
                } catch (error) {
                    safeSend(ws, { type: 'grammar_analysis_error' });
                }
                return;
            }

            // 🔥 VARIABLES GLOBALES DEL FLUJO
            const langNameA = data.langSource || "Spanish";
            const langNameB = data.langTarget || "English";
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);

            // 🎤 ENTRADA DE AUDIO (audio_input)
            if (data.type === 'audio_input' || data.type === 'free_audio_input') {
                if (!data.payload || typeof data.payload !== 'string') { sendEmptyResult(ws, 'no_audio'); return; }
                if (data.payload.length > MAX_AUDIO_BASE64) { sendEmptyResult(ws, 'audio_too_large'); return; }
                if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                try {
                    const audioBuffer = Buffer.from(data.payload, 'base64');
                    let userText = await transcribeAudio(audioBuffer, codeA, codeB);

                    if (isHallucination(userText)) { sendEmptyResult(ws, 'no_speech'); return; }
                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    await respondWithTranslation(ws, data, userText, {
                        langNameA, langNameB, codeA, codeB,
                        isFreeMode: data.type === 'free_audio_input'
                    });
                } catch (error) {
                    console.error("🚨 [Error audio_input]:", error.message);
                    sendEmptyResult(ws, 'server_error');
                }
                return;
            }

            // 📝 ENTRADA DE TEXTO (text_input)
            if (data.type === 'text_input' || data.type === 'free_text_input') {
                const text = typeof data.text === 'string' ? data.text.trim() : '';
                if (!text) { sendEmptyResult(ws, 'no_text'); return; }
                try {
                    if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }
                    await respondWithTranslation(ws, data, text, {
                        langNameA, langNameB, codeA, codeB,
                        isFreeMode: data.type === 'free_text_input'
                    });
                } catch (e) {
                    console.error("🚨 [Error text_input]:", e.message);
                    sendEmptyResult(ws, 'server_error');
                }
                return;
            }

            // 📷 ENTRADA DE IMAGEN (image_translation) — OCR + traducción con IA de visión
            if (data.type === 'image_translation') {
                try {
                    if (!data.image || typeof data.image !== 'string' || data.image.length > MAX_IMAGE_BASE64) {
                        safeSend(ws, { type: 'image_translation_error', message: "La imagen es demasiado grande o no es válida." });
                        return;
                    }
                    const targetLang = data.langTarget || 'Spanish';
                    const sourceHint = data.langSource && data.langSource !== 'Auto'
                        ? `The text is most likely written in ${data.langSource}.`
                        : `Detect the source language automatically.`;

                    const promptTexto = `You are a world-class OCR engine and professional translator.
TASK:
1. Read ALL legible text in the image (signs, menus, labels, documents, handwriting, screens). ${sourceHint}
2. Preserve the reading order and line breaks. Ignore watermarks, UI chrome and unreadable fragments.
3. Translate the extracted text faithfully and naturally into ${targetLang}. Keep prices, numbers, brand names and units unchanged. Keep the same line structure.
4. Identify the source language and write its name in ${targetLang}.
Return ONLY a valid JSON object with exactly these keys:
{"original": "<extracted text>", "translated": "<translation in ${targetLang}>", "detected_lang": "<source language name in ${targetLang}>", "has_text": true}
If there is no readable text, return {"original": "", "translated": "", "detected_lang": "", "has_text": false}.`;

                    const callVision = async (model) => openai.chat.completions.create({
                        model,
                        response_format: { type: "json_object" },
                        messages: [{ role: "user", content: [{ type: "text", text: promptTexto }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.image}`, detail: "high" } }] }],
                        max_tokens: 3000,
                        temperature: 0.1
                    });

                    const primaryModel = process.env.VISION_MODEL || "gpt-4o-mini";
                    let visionResponse;
                    try {
                        visionResponse = await callVision(primaryModel);
                    } catch (modelErr) {
                        if (primaryModel === "gpt-4o-mini") throw modelErr;
                        console.warn(`⚠️ [Vision] ${primaryModel} falló, usando gpt-4o-mini`);
                        visionResponse = await callVision("gpt-4o-mini");
                    }

                    const jsonStr = (visionResponse.choices[0]?.message?.content || '{}').trim().replace(/```json/g, '').replace(/```/g, '').trim();
                    const resultObj = JSON.parse(jsonStr);

                    if (resultObj.has_text === false || !String(resultObj.original || '').trim()) {
                        safeSend(ws, { type: 'image_translation_error', message: "No encontramos texto legible. Acércate un poco más y asegúrate de que haya buena luz." });
                        return;
                    }
                    safeSend(ws, {
                        type: 'image_translation_result',
                        original: resultObj.original,
                        translated: resultObj.translated,
                        detected_lang: resultObj.detected_lang || null
                    });
                } catch (error) {
                    console.error("🚨 [Error Vision]:", error.message);
                    safeSend(ws, { type: 'image_translation_error', message: "No se pudo detectar el texto. Intenta de nuevo." });
                }
            }
        } catch (e) {
            console.error("🚨 [Error WS message]:", e.message);
        }
    });
});
// =================================================================
// 🚀 FINAL DE CONEXIÓN WEBSOCKET PRINCIPAL 🚀
// =================================================================

// 🔥 PRONUNCIACIÓN CON GEMINI (con modelo de respaldo)
const GEMINI_MODELS = [process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

async function askGemini(prompt) {
    if (!process.env.GEMINI_API_KEY) return null;
    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 250 }
    };
    for (const model of [...new Set(GEMINI_MODELS)]) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) continue;
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) return text;
        } catch (e) {}
    }
    return null;
}

async function getPronunciation(textToPronounce, userNativeLanguage) {
    if (!textToPronounce || textToPronounce.length > 500) return null;

    const prompt = `You are a pronunciation expert. Your ONLY task is to write the figurative phonetic pronunciation of the following text, so that a native speaker of ${userNativeLanguage} can read it aloud and sound like a native.
STRICT RULES:
1. ONLY use the standard alphabet and spelling rules of ${userNativeLanguage}. (e.g., if ${userNativeLanguage} is Russian, use Cyrillic; if English, use English phonetics).
2. DO NOT use the International Phonetic Alphabet (IPA) like /ʃ/ or [ɛ].
3. DO NOT provide explanations, translations, or the original text.
4. RETURN ONLY the phonetic transcription.
Text to pronounce: "${textToPronounce}"`;

    const pronun = await askGemini(prompt);
    if (!pronun) return null;

    return pronun.replace(/["'\/\[\]()ʃɛjʊɔɪ]/g, "").trim();
}
