// INICIO DE IMPORTACIONES //
import WebSocket, { WebSocketServer } from 'ws'; 
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
import http from 'http';
// FINAL DE IMPORTACIONES //

// =================================================================
// 🚨 CAZADORES DE ERRORES GLOBALES PARA LA TERMINAL DE RENDER 🚨
// =================================================================
process.on('uncaughtException', (err) => {
    console.error('🚨 [ERROR CRÍTICO NO ATRAPADO]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 [PROMESA RECHAZADA NO MANEJADA]:', reason);
});

// INICIO DE CONFIGURACIÓN INICIAL //
dotenv.config();
const PORT = process.env.PORT || 8080;

// 🔥 CONFIGURACIÓN FIREBASE ADMIN 🔥
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

// INICIO DE CONFIGURACIÓN EXPRESS //
const app = express();
app.use(bodyParser.json()); 

app.get('/', (req, res) => {
    res.status(200).send('Servidor AlterEgo Activo 🚀\n');
});

// =================================================================
// 💰 WEBHOOK DE REVENUECAT (LÓGICA PERFECTA DE REEMBOLSOS x60)
// =================================================================
app.post('/webhook-revenuecat', async (req, res) => {
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

        if (!userId || userId.startsWith('$RCAnonymousID')) return;

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
                await admin.database().ref(`users/${safeOldUserId}`).update({ isPro: false, pro_updated_at: Date.now() });
                await userRef.update({ isPro: true, pro_updated_at: Date.now() });
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
                 const pureCreditPacks = ['starter_10_pack', 'basic_30_pack', 'pro_60_pack', 'ultra_120_pack'];
                 let isSubscription = !pureCreditPacks.includes(productId);
                 
                 let realCredits = 0;
                 
                 try {
                     if (isSubscription) {
                         const resConfig = await fetch(`https://alteregodb-1b8f3-default-rtdb.firebaseio.com/config.json`);
                         const configData = await resConfig.json();
                         if (productId.includes('weekly')) realCredits = configData?.bonus_weekly ? parseInt(configData.bonus_weekly) : 15;
                         else if (productId.includes('monthly')) realCredits = configData?.bonus_monthly ? parseInt(configData.bonus_monthly) : 50;
                         else if (productId.includes('yearly')) realCredits = configData?.bonus_yearly ? parseInt(configData.bonus_yearly) : 399;
                     } else {
                         const resPacks = await fetch(`https://alteregodb-1b8f3-default-rtdb.firebaseio.com/dynamic_config/packages.json`);
                         const firebaseData = await resPacks.json();
                         if (firebaseData && firebaseData[productId] && firebaseData[productId].credits) {
                             realCredits = firebaseData[productId].credits;
                         } else {
                             const defaultCredits = { 'starter_10_pack': 25, 'basic_30_pack': 180, 'pro_60_pack': 450, 'ultra_120_pack': 1000 };
                             if (defaultCredits[productId] !== undefined) realCredits = defaultCredits[productId];
                         }
                     }
                 } catch (err) {
                     console.error("🚨 [Webhook] Error leyendo config en Firebase:", err);
                 }

                 const snapshot = await userRef.once('value');
                 const userData = snapshot.val() || {};
                 let updates = {};

                 if (realCredits > 0) {
                     const unitsToRevoke = realCredits * 60;
                     let currentCredits = parseFloat(userData.credits) || 0;
                     let newBalance = currentCredits - unitsToRevoke;
                     if (newBalance < 0) newBalance = 0; 
                     updates.credits = newBalance;
                 }

                 if (isSubscription) {
                     updates.isPro = false;
                     updates.pro_updated_at = Date.now();
                 } else if (realCredits === 0) {
                     updates.isPro = false;
                     updates.pro_updated_at = Date.now();
                 }

                 if (Object.keys(updates).length > 0) {
                     await userRef.update(updates);
                 }
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

// 🔥 UNIFICACIÓN DE SERVIDOR (SOLUCIÓN AL CRASH DE RENDER) 🔥
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
    console.log(`🏆 SERVIDOR V200 (BIDIRECCIONAL ESTRICTO + VOCES DEEPGRAM REPARADAS): Puerto: ${PORT}`);
});

const RENDER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; 
setInterval(() => {
    fetch(RENDER_URL).catch(() => {});
}, 600000);

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 
const LIVE_SECRET_KEY = "ALTER_LIVE_SECRET_2026"; 

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
const GEMINI_VOICES = ['aoede', 'charon', 'fenrir', 'kore', 'puck'];

// =================================================================
// 🌍 LISTA MAESTRA DE IDIOMAS
// =================================================================
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
    { code: 'sk', name: 'Eslovaco', serverName: 'Slovenian' },
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
    "www.", "televisión española", "derechos de autor", "copyright", "subtítulos realizados"
];
// FINAL DE LISTA DE IDIOMAS GLOBALES //

// 🔥 HELPER CENTRAL PARA GEMINI 3.1 FLASH-LITE 🔥
async function askGemini(prompt, systemInstruction = null) {
    if (!GEMINI_API_KEY) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 250 }
    };
    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    
    try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    } catch (e) {
        return null;
    }
}

// INICIO DE FUNCIONES AUXILIARES //
function getLangCode(serverName) {
    if (!serverName) return 'en';
    const found = LANGUAGES.find(l => l.serverName.toLowerCase() === serverName.toLowerCase());
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

async function deductCreditsFromFirebase(userId, cost) {
    if (!userId || cost <= 0) return;
    try {
        const userRef = admin.database().ref(`users/${userId}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || {};
        let currentCredits = parseFloat(userData.credits) || 0;
        let newBalance = currentCredits - cost;
        await userRef.update({ credits: newBalance });
    } catch (e) {
        console.error("🚨 [ERROR FIREBASE COBRO]:", e.message);
    }
}

function detectLanguageServer(text, codeA, codeB) {
    if (!text) return codeA;
    const lowerText = text.toLowerCase();
    
    const isAsian = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(lowerText);
    const isCyrillic = /[\u0400-\u04ff]/.test(lowerText);
    const isArabic = /[\u0600-\u06ff]/.test(lowerText);

    const checkScript = (code) => {
        const p = code.split('-')[0];
        if (['zh', 'ja', 'ko'].includes(p)) return isAsian;
        if (['ru', 'uk', 'bg', 'be'].includes(p)) return isCyrillic;
        if (['ar', 'fa', 'ur'].includes(p)) return isArabic;
        return false;
    };

    if (checkScript(codeA) && !checkScript(codeB)) return isAsian || isCyrillic || isArabic ? codeA : codeB;
    if (checkScript(codeB) && !checkScript(codeA)) return isAsian || isCyrillic || isArabic ? codeB : codeA;

    const hasSpanishSpecific = /[ñ¿¡]/i.test(lowerText); 
    const hasFrenchSpecific = /[œæçèùâêîôûëïü]/i.test(lowerText); 
    const hasGermanSpecific = /[äöüß]/i.test(lowerText);

    const pA = codeA.split('-')[0];
    const pB = codeB.split('-')[0];

    if (hasSpanishSpecific) { if (pA === 'es') return codeA; if (pB === 'es') return codeB; }
    if (hasFrenchSpecific) { if (pA === 'fr') return codeA; if (pB === 'fr') return codeB; }
    if (hasGermanSpecific) { if (pA === 'de') return codeA; if (pB === 'de') return codeB; }

    const words = lowerText.replace(/[^\w\sáéíóúñàèìòùâêîôûäöüßãõç]/gi, '').split(/\s+/);
    
    const dict = {
        en: ['the', 'is', 'are', 'you', 'how', 'what', 'why', 'where', 'when', 'who', 'this', 'that', 'it', 'to', 'and', 'of', 'in', 'on', 'for', 'with', 'as', 'do', 'will', 'can', 'my', 'your', 'we', 'they', 'he', 'she', 'but', 'not', 'i'],
        es: ['el', 'la', 'los', 'las', 'un', 'una', 'es', 'son', 'tú', 'tu', 'como', 'qué', 'por', 'donde', 'cuando', 'quien', 'este', 'esto', 'ese', 'eso', 'a', 'y', 'de', 'en', 'para', 'con', 'hacer', 'poder', 'mi', 'su', 'nosotros', 'ellos', 'él', 'ella', 'pero', 'no', 'hola', 'bien'],
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

// 🔥 MAPEO DE VOCES DEEPGRAM EXCLUSIVO (SIN AAC, RESTAURADO A LINEAR16 PARA QUE DEEPGRAM NO FALLE) 🔥
function getDeepgramVoiceId(voiceId, textLang) {
    if (!voiceId) return "aura-asteria-en";
    
    const tLang = (textLang || 'en').substring(0, 2).toLowerCase();
    const isMale = voiceId === 'premium_male';
    
    // Si tu app ya envía un modelo exacto de Aura, lo respeta tal cual:
    if (voiceId.startsWith('aura-')) return voiceId;
    
    // Si tu app envía el perfil dinámico (Mujer / Hombre), asigna el acento correcto del país:
    if (tLang === 'es') return isMale ? "aura-2-alvaro-es" : "aura-luna-es"; 
    if (tLang === 'en') return isMale ? "aura-orion-en" : "aura-asteria-en";
    if (tLang === 'fr') return isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr"; 
    if (tLang === 'de') return isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de"; 
    if (tLang === 'it') return isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it"; 
    if (tLang === 'nl') return "aura-2-beatrix-nl"; 
    if (tLang === 'ja') return isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja"; 
    
    return isMale ? "aura-orion-en" : "aura-asteria-en";
}

// 🔥 CANDADO DE PRONUNCIACIÓN MEJORADO (PROMPT EN INGLÉS ESTRICTO) 🔥
async function getPronunciation(textToPronounce, userNativeLanguage) {
    if (!textToPronounce || textToPronounce.length > 500) return null; 
    try {
        const prompt = `You are a pronunciation expert. Your ONLY task is to write the figurative phonetic pronunciation of the following text, so that a native speaker of ${userNativeLanguage} can read it aloud and sound like a native.
STRICT RULES:
1. ONLY use the standard alphabet and spelling rules of ${userNativeLanguage}. (e.g., if ${userNativeLanguage} is Russian, use Cyrillic; if English, use English phonetics).
2. DO NOT use the International Phonetic Alphabet (IPA) like /ʃ/ or [ɛ].
3. DO NOT provide explanations, translations, or the original text.
4. RETURN ONLY the phonetic transcription.
Text to pronounce: "${textToPronounce}"`;

        let pronun = "";
        try {
            const response = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-versatile",
                temperature: 0.1,
                max_tokens: 150,
                stream: false
            });
            pronun = response.choices[0]?.message?.content || "";
        } catch (errGroq) {
            const response = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "gpt-4o-mini",
                temperature: 0.1,
                max_tokens: 150,
                stream: false
            });
            pronun = response.choices[0]?.message?.content || "";
        }
        
        return pronun.replace(/["'\/\[\]()ʃɛjʊɔɪ]/g, "").trim();
    } catch (e) {
        return null;
    }
}
// FINAL DE FUNCIONES AUXILIARES //

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// =================================================================
// 🚀 INICIO DE CONEXIÓN WEBSOCKET PRINCIPAL 🚀
// =================================================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 
    ws.userId = null; 

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 20) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // 🔐 AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                let realCredits = 0;
                if (data.user_id) {
                    ws.userId = data.user_id; 
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) realCredits = parseFloat(userData.credits);
                    } catch (err) {}
                }
                safeSend(ws, { type: 'auth_success', credits: realCredits }); 
                return;
            }

            // 🎙️ VISTA PREVIA TTS (CON DEEPGRAM LINEAR16 REPARADO)
            if (data.type === 'tts_request') {
                if (data.voice_engine && data.voice_engine !== 'free' && data.voice_engine !== 'native') {
                    try {
                        if (ws.userId && data.cost && !data.is_preview) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                        let textForAudioGreeting = data.text;
                        let ttsSuccess = false;
                        let base64Audio = null;
                        const requestedVoice = data.voice || data.openai_voice || 'nova';

                        let activeProvider = data.voice_engine;
                        if (requestedVoice.startsWith('aura-') || requestedVoice.startsWith('premium_')) activeProvider = 'deepgram';
                        else if (OPENAI_VOICES.includes(requestedVoice)) activeProvider = 'openai';

                        if (activeProvider === 'deepgram') {
                            const previewLang = detectLanguageServer(textForAudioGreeting, 'es', 'en');
                            let dVoice = getDeepgramVoiceId(requestedVoice, previewLang);
                            
                            try {
                                const dUrl = `https://api.deepgram.com/v1/speak?model=${dVoice}&encoding=linear16`;
                                const dRes = await fetch(dUrl, {
                                    method: "POST", headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
                                    body: JSON.stringify({ text: textForAudioGreeting })
                                });
                                
                                if (dRes.ok) {
                                    const arrayBuffer = await dRes.arrayBuffer();
                                    base64Audio = Buffer.from(arrayBuffer).toString('base64');
                                    ttsSuccess = true;
                                }
                            } catch (e) {}
                        }

                        if (!ttsSuccess && activeProvider === 'openai') {
                            try {
                                const validVoice = OPENAI_VOICES.includes(requestedVoice) ? requestedVoice : 'nova';
                                const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 

                                const oRes = await fetch("https://api.openai.com/v1/audio/speech", {
                                    method: "POST", headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                    body: JSON.stringify({ model: "tts-1", input: textForAudioGreeting, voice: validVoice, speed: voiceSpeed })
                                });
                                
                                if (oRes.ok) {
                                    const arrayBuffer = await oRes.arrayBuffer();
                                    base64Audio = Buffer.from(arrayBuffer).toString('base64');
                                } 
                            } catch (e) {}
                        }

                        ws.send(JSON.stringify({ type: 'full_response', user_text: null, ai_text: data.text, audio: base64Audio }));
                    } catch (err) {}
                }
                return;
            }

            // ✍️ ANÁLISIS DE GRAMÁTICA
            if (data.type === 'analyze_grammar') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                try {
                    const prompt = `Eres un experto profesor de idiomas. Evalúa ÚNICAMENTE las frases del estudiante en esta conversación. Corrige y felicita.\n\n${data.text}`;
                    let feedback = "";
                    try {
                        const completion = await groq.chat.completions.create({
                            messages: [{ role: "user", content: prompt }], model: "llama-3.3-70b-versatile", temperature: 0.5, max_tokens: 500
                        });
                        feedback = completion.choices[0]?.message?.content;
                    } catch (e) {
                        const completion = await openai.chat.completions.create({
                            messages: [{ role: "user", content: prompt }], model: "gpt-4o-mini", temperature: 0.5, max_tokens: 500
                        });
                        feedback = completion.choices[0]?.message?.content;
                    }
                    ws.send(JSON.stringify({ type: 'grammar_analysis_result', feedback: feedback || "Análisis fallido." }));
                } catch (error) { ws.send(JSON.stringify({ type: 'grammar_analysis_error' })); }
                return;
            }

            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);

            // =================================================================
            // 🎤 INICIO DE ENTRADA DE AUDIO Y TEXTO (MÁXIMA VELOCIDAD RAM)
            // =================================================================
            if (data.type === 'audio_input' || data.type === 'free_audio_input' || data.type === 'text_input' || data.type === 'free_text_input') {
                const isFreeMode = data.type === 'free_audio_input' || data.type === 'free_text_input';
                const isAudio = data.type.includes('audio');
                let userText = data.text || "";

                if (isAudio && data.payload) {
                    if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                    const audioBuffer = Buffer.from(data.payload, 'base64');
                    const useWhisper = WHISPER_LANGUAGES.includes(codeA) || WHISPER_LANGUAGES.includes(codeB);

                    if (useWhisper || isFreeMode) {
                        const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.m4a`);
                        fs.writeFileSync(tempFilePath, audioBuffer);
                        try {
                            const whisperResponse = await openai.audio.transcriptions.create({
                                file: fs.createReadStream(tempFilePath),
                                model: 'whisper-1', prompt: "Do not transcribe silence. Only output spoken words clearly.",
                                temperature: 0.0, condition_on_previous_text: false 
                            });
                            userText = whisperResponse.text.trim();
                        } finally { fs.unlinkSync(tempFilePath); }
                    } else {
                        try {
                            const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                                audioBuffer, { model: "nova-2", detect_language: true, smart_format: true, punctuate: true, utterances: true }
                            );
                            if (error) throw new Error("Deepgram error");
                            userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim();
                        } catch (deepgramError) {
                            const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.m4a`);
                            fs.writeFileSync(tempFilePath, audioBuffer);
                            try {
                                const whisperFallbackResponse = await openai.audio.transcriptions.create({
                                    file: fs.createReadStream(tempFilePath), model: 'whisper-1', prompt: "Do not transcribe silence.", temperature: 0.0, condition_on_previous_text: false 
                                });
                                userText = whisperFallbackResponse.text.trim();
                            } finally { fs.unlinkSync(tempFilePath); }
                        }
                    }

                    const textLower = userText ? userText.toLowerCase() : "";
                    if (WHISPER_HALLUCINATIONS.some(h => textLower.includes(h))) userText = ""; 
                    if (userText && userText.length <= 2 && !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(userText)) userText = "";

                    if (!userText || userText.length < 1) {
                        return safeSend(ws, { type: 'error_audio_empty' });
                    }
                } else if (!isAudio) {
                    if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }
                }

                console.log(`🗣️ [Input]: "${userText}"`);

                let groqMessages = [];
                let sysPrompt = "";

                // 🔥 RUTAS DE PROMPTS EXCLUSIVAMENTE PARA LIVE O CLASSIC 🔥
                if (data.live_key === LIVE_SECRET_KEY) {
                    sysPrompt = `You are a pure, machine-like bidirectional translation API. Your ONLY task is to translate text between ${langNameA} (Code: ${codeA}) and ${langNameB} (Code: ${codeB}).
CRITICAL RULES:
1. Identify if the input is closer to ${langNameA} or ${langNameB}.
2. If the input is ${langNameA}, translate to ${langNameB} and output exactly: ${codeB}|||[Translated Text]
3. If the input is ${langNameB}, translate to ${langNameA} and output exactly: ${codeA}|||[Translated Text]
4. PROHIBITED: NEVER refuse to translate. NEVER say "No translation available" or "I cannot translate". NEVER apologize.
5. If the input contains gibberish, unknown names, or unrecognized words (e.g., "Kongisiwa Ogawari", "Tunom Brequolis", "Bjaj"), DO NOT EXPLAIN IT. Simply return the exact same words formatted with the target code (e.g., ${codeB}|||Kongisiwa Ogawari).
6. Your response must consist ONLY of the language code, the three pipes (|||), and the text.`;
                } else {
                    sysPrompt = `You are a strict translation API between ${langNameA} and ${langNameB}. Output ONLY the translation. NEVER refuse to translate. IF THE TEXT IS GIBBERISH OR NAMES, JUST RETURN IT EXACTLY AS IT IS.`;
                }

                groqMessages.push({ role: "system", content: sysPrompt });
                groqMessages.push({ role: "user", content: userText });

                let aiTextRaw = "";

                // 🔥 MOTOR ULTRA-VELOZ DE GROQ RESTAURADO A 70B 🔥
                try {
                    const response = await groq.chat.completions.create({
                        messages: groqMessages,
                        model: "llama-3.3-70b-versatile",
                        temperature: 0.1,
                        max_tokens: 200, 
                        stream: false
                    });
                    aiTextRaw = response.choices[0]?.message?.content || "";
                    if (aiTextRaw.length > 0 && !/\p{L}|\p{N}/u.test(aiTextRaw)) throw new Error("Solo puntuación");
                } catch (groqError) {
                    const oRes = await openai.chat.completions.create({
                        messages: groqMessages, model: "gpt-4o-mini", temperature: 0.1, max_tokens: 200, stream: false
                    });
                    aiTextRaw = oRes.choices[0]?.message?.content || "";
                }
                
                // 🔥 LIMPIEZA DE CUALQUIER PREFIJO FANTASMA PARA EVITAR EL "PELEA DE ACENTOS" 🔥
                let cleanAiText = aiTextRaw.replace(/^([a-zA-Z]{2}(-[a-zA-Z]{2})?)(?:\|\|\||\s*:|-|\s+)?\s*/i, '').trim();
                
                // Escudo Activo: El servidor analiza el texto puro para asegurar el idioma final
                let finalOutputLang = detectLanguageServer(cleanAiText, codeA, codeB);
                let aiText = sanitizeAiResponse(cleanAiText);
                
                if (!aiText) return safeSend(ws, { type: 'full_response', user_text: userText, ai_text: "...", detected_lang: finalOutputLang, audio: null });

                console.log(`🧠 [Output]: Lang: ${finalOutputLang} | Text: "${aiText}"`);

                let base64Audio = null;
                let finalPronunciation = null;

                let pronunPromise = Promise.resolve(null);
                let ttsPromise = Promise.resolve(null);

                // Pronunciación para Modo Clásico (No Live)
                if (data.wants_pronunciation && !data.live_key) {
                    const userNativeLang = (finalOutputLang === codeA) ? langNameB : langNameA;
                    pronunPromise = getPronunciation(aiText, userNativeLang);
                }
                
                // 🔥 SELECCIÓN DINÁMICA DE VOZ (LIVESCREEN Y CLASSIC) 🔥
                let activeVoice = null;
                if (data.live_key === LIVE_SECRET_KEY) {
                    // Selecciona myVoice si la IA tradujo al idioma principal, o targetVoice si tradujo al extranjero
                    activeVoice = finalOutputLang === codeA ? (data.myVoice || { provider: 'native', id: 'native' }) : (data.targetVoice || { provider: 'native', id: 'native' });
                } else {
                    activeVoice = { provider: data.voice_engine || 'native', id: data.openai_voice || 'nova' };
                }

                if (!isFreeMode && activeVoice && activeVoice.provider !== 'native' && activeVoice.provider !== 'free') {
                    let textForAudio = aiText.replace(/\|\|\|/g, ' ').replace(/###/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/["']/g, '').trim();

                    if (activeVoice.provider === 'deepgram' || DEEPGRAM_VOICES.includes(activeVoice.id)) {
                        // 🔥 ACENTOS PERFECTOS SEGÚN EL IDIOMA REAL DEL TEXTO, Y LINEAR16 PARA EVITAR CRASH DE AAC 🔥
                        const dVoice = getDeepgramVoiceId(activeVoice.id, finalOutputLang);
                        ttsPromise = fetch(`https://api.deepgram.com/v1/speak?model=${dVoice}&encoding=linear16`, {
                            method: "POST", headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: textForAudio })
                        }).then(async dRes => {
                            if (dRes.ok) return Buffer.from(await dRes.arrayBuffer()).toString('base64');
                            return null;
                        }).catch(() => null);

                    } else if (activeVoice.provider === 'openai' || OPENAI_VOICES.includes(activeVoice.id)) {
                        const validVoice = OPENAI_VOICES.includes(activeVoice.id) ? activeVoice.id : 'nova';
                        const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0;
                        ttsPromise = fetch("https://api.openai.com/v1/audio/speech", {
                            method: "POST", headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "tts-1", input: textForAudio, voice: validVoice, speed: voiceSpeed })
                        }).then(async oRes => {
                            if (oRes.ok) return Buffer.from(await oRes.arrayBuffer()).toString('base64');
                            return null;
                        }).catch(() => null);
                    }
                }

                try {
                    const [pronunResult, ttsResult] = await Promise.all([pronunPromise, ttsPromise]);
                    finalPronunciation = pronunResult;
                    base64Audio = ttsResult;
                } catch (e) {}

                safeSend(ws, { type: 'full_response', user_text: userText, ai_text: aiText, detected_lang: finalOutputLang, audio: base64Audio, pronunciation: finalPronunciation });
            }
            
            // INICIO DE ENTRADA DE IMAGEN //
            else if (data.type === 'image_translation') {
                try {
                    const promptTexto = `You are a professional translator. Extract the main visible text from this image and translate it to ${data.langTarget || 'Spanish'}. Return ONLY a valid JSON object in this exact format: {"original": "Text found", "translated": "Translated text"}`;
                    const visionResponse = await openai.chat.completions.create({
                        model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "text", text: promptTexto }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.image}`, detail: "low" } }] }], max_tokens: 200, temperature: 0.1 
                    });

                    let jsonStr = visionResponse.choices[0].message.content.trim().replace(/```json/g, '').replace(/```/g, '').trim();
                    const resultObj = JSON.parse(jsonStr);
                    safeSend(ws, { type: 'image_translation_result', original: resultObj.original, translated: resultObj.translated });
                } catch (error) {
                    safeSend(ws, { type: 'image_translation_error', message: "No se pudo detectar el texto." });
                }
            }
        } catch (e) { console.error("🚨 [ERROR GLOBAL WS]:", e.message); }
    });
});

