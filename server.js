// INICIO DE IMPORTACIONES //
import WebSocket, { WebSocketServer } from 'ws'; 
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import fetch from 'node-fetch';
import OpenAI from 'openai'; // 🔥 RESTAURADO OPENAI 🔥
import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import crypto from 'crypto'; 
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
// FINAL DE CONFIGURACIÓN INICIAL //

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
// 💰 WEBHOOK DE REVENUECAT (EL VERDUGO)
// =================================================================
app.post('/webhook-revenuecat', async (req, res) => {
    // Respuesta inmediata a RevenueCat para evitar Timeouts
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

        // Limpieza de caracteres prohibidos por Firebase
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
                console.log(`🔄 [RevenueCat] VIP movido de (${safeOldUserId}) a (${safeUserId})`);
            } else {
                await userRef.update({ isPro: true, pro_updated_at: Date.now() });
            }
        }
        else if (eventType === "EXPIRATION") {
             // Eliminación directa sin condiciones
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
                 
                 // Lógica antigua restaurada: Busca en Firebase el valor a descontar
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

                 // Aplica la resta multiplicada por 60 para igualar tus unidades
                 if (realCredits > 0) {
                     const unitsToRevoke = realCredits * 60;
                     let currentCredits = parseFloat(userData.credits) || 0;
                     let newBalance = currentCredits - unitsToRevoke;
                     
                     // 🔥 AHORA SE PERMITEN NÚMEROS NEGATIVOS (DEUDA) 🔥
                     updates.credits = newBalance;
                     console.log(`🚨 [RevenueCat] REEMBOLSO: Se quitaron ${unitsToRevoke} unidades (${realCredits} créditos) a ${safeUserId}. Saldo ajustado a: ${newBalance} (Deuda)`);
                 }

                 if (isSubscription) {
                     updates.isPro = false;
                     updates.pro_updated_at = Date.now();
                     console.log(`❌ [RevenueCat] VIP revocado a ${safeUserId} (Motivo: ${event.cancel_reason}).`);
                 } else if (realCredits === 0) {
                     updates.isPro = false;
                     updates.pro_updated_at = Date.now();
                 }

                 if (Object.keys(updates).length > 0) {
                     await userRef.update(updates);
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

// INICIO DE INICIALIZACIÓN DE SERVIDOR Y APIS //
const server = app.listen(PORT, () => {
    console.log(`🏆 SERVIDOR V170 (GEMINI 3.1 FLASH-LITE + WHISPER + GROQ): Puerto: ${PORT}`);
});

const wss = new WebSocketServer({ server });

const RENDER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; 
setInterval(() => {
    fetch(RENDER_URL).catch(() => {});
}, 600000);

// 🔥 RESTAURAMOS INSTANCIAS COMPLETAS 🔥
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 
const SIMULATOR_SECRET_KEY = "ALTER_ROLEPLAY_SECRET_2026";
const LIVE_SECRET_KEY = "ALTER_LIVE_SECRET_2026"; 

// 🔥 INICIO DE LISTAS DE VOCES IA 🔥
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']; // 🔥 OPENAI RESTAURADO 🔥
const DEEPGRAM_VOICES = [
    'aura-asteria-en', 'aura-luna-en', 'aura-orion-en', 
    'aura-luna-es', 'aura-orion-es', 'aura-2-alvaro-es', 'aura-2-carina-es', 
    'aura-2-hector-fr', 'aura-2-agathe-fr', 
    'aura-2-fabian-de', 'aura-2-aurelia-de', 
    'aura-2-cesare-it', 'aura-2-cinzia-it', 
    'aura-2-beatrix-nl', 'aura-2-ebisu-ja', 'aura-2-ama-ja'
];
const GEMINI_VOICES = ['aoede', 'charon', 'fenrir', 'kore', 'puck'];
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

// 🔥 LISTA DE IDIOMAS DE WHISPER RESTAURADA 🔥
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
// 🔥 FIN HELPER GEMINI 🔥

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
        console.log(`📉 [Cobro] Se cobraron ${cost} uds a ${userId}. Nuevo saldo: ${newBalance}`);
    } catch (e) {
        console.error("🚨 [ERROR FIREBASE COBRO]:", e.message);
    }
}

// Respaldo de seguridad en caso de que la IA desobedezca
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
    const hasPortugueseSpecific = /[ãõ]/i.test(lowerText);

    const pA = codeA.split('-')[0];
    const pB = codeB.split('-')[0];

    if (hasSpanishSpecific) { if (pA === 'es') return codeA; if (pB === 'es') return codeB; }
    if (hasFrenchSpecific) { if (pA === 'fr') return codeA; if (pB === 'fr') return codeB; }
    if (hasGermanSpecific) { if (pA === 'de') return codeA; if (pB === 'de') return codeB; }
    if (hasPortugueseSpecific) { if (pA === 'pt') return codeA; if (pB === 'pt') return codeB; }

    const words = lowerText.replace(/[^\w\sáéíóúñàèìòùâêîôûäöüßãõçœ]/gi, '').split(/\s+/);
    
    const dict = {
        en: ['the', 'is', 'are', 'you', 'how', 'what', 'why', 'where', 'when', 'who', 'this', 'that', 'it', 'to', 'and', 'of', 'in', 'on', 'for', 'with', 'as', 'do', 'will', 'can', 'my', 'your', 'we', 'they', 'he', 'she', 'but', 'not', 'i'],
        es: ['el', 'la', 'los', 'las', 'un', 'una', 'es', 'son', 'tú', 'tu', 'como', 'qué', 'por', 'donde', 'cuando', 'quien', 'este', 'esto', 'ese', 'eso', 'a', 'y', 'de', 'en', 'para', 'con', 'hacer', 'poder', 'mi', 'su', 'nosotros', 'ellos', 'él', 'ella', 'pero', 'no', 'hola', 'bien', 'del', 'al', 'sí'],
        fr: ['le', 'la', 'les', 'un', 'une', 'des', 'est', 'sont', 'tu', 'ton', 'comment', 'quoi', 'pourquoi', 'où', 'quand', 'qui', 'ce', 'cette', 'ça', 'à', 'et', 'de', 'en', 'pour', 'avec', 'faire', 'pouvoir', 'mon', 'son', 'nous', 'ils', 'il', 'elle', 'mais', 'ne', 'pas', 'je', 'oui', 'bonjour', 'très', 'bien', 'dans', 'sur'],
        de: ['der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einer', 'ist', 'sind', 'du', 'dein', 'wie', 'was', 'warum', 'wo', 'wann', 'wer', 'diese', 'dieses', 'zu', 'und', 'von', 'in', 'für', 'mit', 'machen', 'können', 'mein', 'sein', 'wir', 'sie', 'er', 'aber', 'nicht', 'ich', 'ja', 'nein', 'hallo', 'gut', 'auf'],
        it: ['il', 'la', 'i', 'le', 'un', 'una', 'è', 'sono', 'tu', 'tuo', 'come', 'cosa', 'perché', 'dove', 'quando', 'chi', 'questo', 'questa', 'a', 'e', 'di', 'in', 'per', 'con', 'fare', 'potere', 'mio', 'suo', 'noi', 'loro', 'lui', 'lei', 'ma', 'non', 'io', 'sì', 'ciao', 'bene', 'su', 'da', 'del'],
        nl: ['de', 'het', 'een', 'is', 'zijn', 'jij', 'jouw', 'hoe', 'wat', 'waarom', 'waar', 'wanneer', 'wie', 'dit', 'dat', 'te', 'en', 'van', 'in', 'voor', 'met', 'doen', 'kunnen', 'mijn', 'zijn', 'wij', 'zij', 'hij', 'maar', 'niet', 'ik', 'ja', 'nee', 'hallo', 'goed', 'op', 'naar'],
        pt: ['o', 'a', 'os', 'as', 'um', 'uma', 'é', 'são', 'tu', 'teu', 'como', 'que', 'onde', 'quem', 'este', 'esta', 'isso', 'a', 'e', 'de', 'em', 'para', 'com', 'fazer', 'poder', 'meu', 'seu', 'nós', 'eles', 'ele', 'ela', 'mas', 'não', 'eu', 'sim', 'olá', 'bem', 'no', 'na', 'do', 'da']
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

// 🔥 AQUÍ SE SOLUCIONÓ EL PROBLEMA PARA QUE LA FONÉTICA SEA ADAPTADA A TU IDIOMA DE ORIGEN (USANDO GEMINI) 🔥
async function getPronunciation(textToPronounce, userNativeLanguage) {
    if (!textToPronounce || textToPronounce.length > 500) return null; 
    const prompt = `Como experto, tu única tarea es escribir la pronunciación figurada del siguiente texto, escribiéndolo EXACTAMENTE como se leería usando las reglas ortográficas y sonidos literales de un hablante nativo de ${userNativeLanguage}. NO uses el alfabeto fonético internacional ni diccionarios. Si el idioma es Español y el texto es 'Hello', debes devolver 'jelou'.\nREGLAS ESTRICTAS:\n1. NO des explicaciones.\n2. NO incluyas el texto original.\n3. SOLO devuelve la transcripción figurada usando letras naturales de ${userNativeLanguage}.\n4. ABSOLUTAMENTE NINGÚN TEXTO ADICIONAL.\nTexto a pronunciar: "${textToPronounce}"`;
    return await askGemini(prompt);
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

            // 🎙️ VISTA PREVIA 
            if (data.type === 'tts_request') {
                if ((data.live_key === LIVE_SECRET_KEY || data.simulator_key === SIMULATOR_SECRET_KEY) && data.voice_engine && data.voice_engine !== 'free' && data.voice_engine !== 'native') {
                    try {
                        if (ws.userId && data.cost && !data.is_preview) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                        let textForAudioGreeting = data.text;
                        let ttsSuccess = false;
                        let base64Audio = null;
                        const requestedVoice = data.voice || data.openai_voice || 'nova';

                        if (DEEPGRAM_VOICES.includes(requestedVoice) || data.voice_engine === 'deepgram') {
                            let dVoice = DEEPGRAM_VOICES.includes(requestedVoice) ? requestedVoice : "aura-asteria-en"; 
                            try {
                                const dUrl = `https://api.deepgram.com/v1/speak?model=${dVoice}`;
                                const dRes = await fetch(dUrl, {
                                    method: "POST",
                                    headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
                                    body: JSON.stringify({ text: textForAudioGreeting })
                                });
                                
                                if (dRes.ok) {
                                    const arrayBuffer = await dRes.arrayBuffer();
                                    base64Audio = Buffer.from(arrayBuffer).toString('base64');
                                    ttsSuccess = true;
                                }
                            } catch (e) {}
                        }

                        // 🔥 Integración TTS OpenAI (RESTAURADO) 🔥
                        if (!ttsSuccess && OPENAI_VOICES.includes(requestedVoice)) {
                            try {
                                const validVoice = OPENAI_VOICES.includes(requestedVoice) ? requestedVoice : 'nova';
                                const oRes = await fetch("https://api.openai.com/v1/audio/speech", {
                                    method: "POST",
                                    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                    body: JSON.stringify({ model: "tts-1", input: textForAudioGreeting, voice: validVoice })
                                });
                                
                                if (oRes.ok) {
                                    base64Audio = Buffer.from(await oRes.arrayBuffer()).toString('base64');
                                    ttsSuccess = true;
                                } 
                            } catch (e) {}
                        }

                        // 🔥 Integración TTS Gemini 🔥
                        if (!ttsSuccess && GEMINI_VOICES.includes(requestedVoice)) {
                            try {
                                const gRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GEMINI_API_KEY}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        input: { text: textForAudioGreeting },
                                        voice: { name: requestedVoice, languageCode: "en-US" },
                                        audioConfig: { audioEncoding: "MP3" }
                                    })
                                });
                                if (gRes.ok) {
                                    const gData = await gRes.json();
                                    base64Audio = gData.audioContent; 
                                } 
                            } catch (e) {}
                        }
                        
                        safeSend(ws, { type: 'full_response', user_text: null, ai_text: data.text, audio: base64Audio });
                    } catch (err) {}
                }
                return;
            }

            // ✍️ ANÁLISIS DE GRAMÁTICA (Usando Gemini)
            if (data.type === 'analyze_grammar') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                try {
                    const prompt = `Eres un experto profesor de idiomas. Evalúa ÚNICAMENTE las frases del estudiante en esta conversación. Corrige y felicita.\n\n${data.text}`;
                    const resTexto = await askGemini(prompt);
                    safeSend(ws, { type: 'grammar_analysis_result', feedback: resTexto || "Análisis fallido." });
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
            const scenarioId = data.scenario_id || 'teacher';

            // 🎤 INICIO DE ENTRADA DE AUDIO (audio_input tradicional)
            if (data.type === 'audio_input' || data.type === 'free_audio_input') {
                if (!data.payload) return;
                if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                const audioBuffer = Buffer.from(data.payload, 'base64');
                let userText = "";
                
                const randomId = crypto.randomBytes(4).toString('hex');
                const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}_${randomId}.m4a`);
                
                await fs.promises.writeFile(tempFilePath, audioBuffer); 

                try {
                    // 🔥 LÓGICA ORIGINAL WHISPER / DEEPGRAM RESTAURADA EXACTAMENTE COMO LA PEDISTE 🔥
                    if (WHISPER_LANGUAGES.includes(codeA) || WHISPER_LANGUAGES.includes(codeB)) {
                        const whisperResponse = await openai.audio.transcriptions.create({
                            file: fs.createReadStream(tempFilePath),
                            model: 'whisper-1',
                            prompt: "Do not transcribe silence. Only output spoken words clearly.",
                            temperature: 0.0, 
                            condition_on_previous_text: false 
                        });
                        userText = whisperResponse.text.trim();
                    } else {
                        try {
                            const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                                audioBuffer, { model: "nova-2", detect_language: [codeA, codeB], smart_format: true, punctuate: true, utterances: true, mimetype: 'audio/mp4' }
                            );
                            if (error) throw new Error("Deepgram devolvió un error");
                            userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim();
                        } catch (deepgramError) {
                            const whisperFallbackResponse = await openai.audio.transcriptions.create({
                                file: fs.createReadStream(tempFilePath),
                                model: 'whisper-1',
                                prompt: "Do not transcribe silence.",
                                temperature: 0.0, 
                                condition_on_previous_text: false 
                            });
                            userText = whisperFallbackResponse.text.trim();
                        }
                    }
                } finally {
                    fs.promises.unlink(tempFilePath).catch(()=>{}); 
                }

                try {
                    const textLower = userText ? userText.toLowerCase() : "";
                    if (WHISPER_HALLUCINATIONS.some(h => textLower.includes(h))) userText = ""; 
                    if (userText && userText.length <= 2 && !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(userText)) userText = "";

                    if (!userText || userText.length < 1) {
                        return safeSend(ws, { type: 'full_response', user_text: "", ai_text: "Vuelve a intentarlo...", detected_lang: codeA, audio: null });
                    }
                    
                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    let temp = 0.0;
                    let maxTokens = 200;

                    // 🔥 INSTRUCCIONES ESTRICTAS: MODO ROBOT DE TRADUCCIÓN 🔥
                    const sysPrompt = `You are a dumb translation algorithm. You cannot chat, converse, or answer questions.
Task: Translate strictly between ${langNameA} (Code: ${codeA}) and ${langNameB} (Code: ${codeB}).

RULES:
1. Identify if the input is ${codeA} or ${codeB}. Translate to the OTHER language.
2. Format response EXACTLY as: [TARGET_CODE]Translated text
3. DO NOT ANSWER QUESTIONS. If input is "How are you?" or "What's your name?", TRANSLATE the question.
4. NO conversational text, NO arrows, NO notes.
5. If input is unintelligible gibberish, return EXACTLY: [${codeA}]Vuelve a intentarlo...`;

                    let aiTextRaw = "";

                    // 🔥 GROQ COMO MOTOR PRINCIPAL 🔥
                    try {
                        let response = await groq.chat.completions.create({
                            messages: [{role: "system", content: data.tone || sysPrompt}, {role: "user", content: userText}], 
                            model: "llama-3.3-70b-versatile", temperature: temp, max_tokens: maxTokens, stream: false
                        });
                        aiTextRaw = response.choices[0]?.message?.content || "";
                        
                        // 🛡️ DETECTOR UNIVERSAL DE ALUCINACIONES
                        if (aiTextRaw.length > 0 && !/\p{L}|\p{N}/u.test(aiTextRaw)) {
                            console.log("⚠️ Groq alucinó con puntuación. Pasando a Gemini...");
                            throw new Error("Groq returned only punctuation");
                        }
                    } catch (groqError) {
                        // 🔥 GEMINI 3.1 FLASH-LITE EN ACCIÓN SI GROQ FALLA O DEVUELVE PUNTUACIÓN 🔥
                        aiTextRaw = await askGemini(userText, data.tone || sysPrompt);
                    }
                    
                    aiTextRaw = sanitizeAiResponse(aiTextRaw);
                    
                    if (!aiTextRaw || !/\p{L}|\p{N}/u.test(aiTextRaw)) {
                        return safeSend(ws, { type: 'full_response', user_text: userText, ai_text: "Vuelve a intentarlo...", detected_lang: codeA, audio: null });
                    }

                    // 🔥 EXTRACCIÓN DEL CÓDIGO INVISIBLE PARA NO CRUZAR ACENTOS 🔥
                    let finalOutputLang = codeA;
                    let aiText = aiTextRaw;
                    const langMatch = aiTextRaw.match(/^\[([a-zA-Z-]+)\]\s*(.*)/s);
                    if (langMatch) {
                        finalOutputLang = langMatch[1];
                        aiText = langMatch[2].trim();
                    } else {
                        finalOutputLang = detectLanguageServer(aiTextRaw, codeA, codeB);
                    }

                    console.log(`🧠 [Respuesta IA NATIVA]: Lang: ${finalOutputLang} | Text: "${aiText}"`);

                    let base64Audio = null;
                    const isFreeMode = data.type === 'free_audio_input'; 
                    let finalPronunciation = null;

                    // 🔥 MEJORA DE VELOCIDAD EXTREMA Y BLOQUEO PARA LIVE SCREEN 🔥
                    let pronunPromise = Promise.resolve(null);
                    let ttsPromise = Promise.resolve(null);

                    if (data.wants_pronunciation && data.live_key !== LIVE_SECRET_KEY) {
                        const userNativeLang = (finalOutputLang === codeA) ? langNameB : langNameA;
                        pronunPromise = getPronunciation(aiText, userNativeLang);
                    }
                    
                    if (!isFreeMode && data.live_key === LIVE_SECRET_KEY) {
                        let activeVoice = finalOutputLang === codeA 
                            ? (data.myVoice || { provider: 'native', id: 'native' }) 
                            : (data.targetVoice || { provider: 'native', id: 'native' });

                        if (activeVoice.provider !== 'native' && activeVoice.provider !== 'free') {
                            if (activeVoice.provider === 'deepgram') {
                                    const tLang = finalOutputLang.substring(0, 2).toLowerCase();
                                    const maleIds = ['premium_male', 'gemini_male', 'aura-orion-en', 'aura-2-alvaro-es', 'aura-2-hector-fr', 'aura-2-fabian-de', 'aura-2-cesare-it', 'aura-2-ebisu-ja'];
                                    const isMale = maleIds.includes(activeVoice.id);
                                    
                                    let dVoice = "aura-asteria-en"; 
                                    if (tLang === 'en') dVoice = isMale ? "aura-orion-en" : "aura-asteria-en";
                                    else if (tLang === 'es') dVoice = isMale ? "aura-2-alvaro-es" : "aura-2-carina-es";
                                    else if (tLang === 'fr') dVoice = isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr"; 
                                    else if (tLang === 'de') dVoice = isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de"; 
                                    else if (tLang === 'it') dVoice = isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it"; 
                                    else if (tLang === 'nl') dVoice = "aura-2-beatrix-nl"; 
                                    else if (tLang === 'ja') dVoice = isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja"; 

                                    let textForAudio = aiText.replace(/\|\|\|/g, ' ').replace(/###/g, '').replace(/["']/g, '').trim();

                                    ttsPromise = fetch(`https://api.deepgram.com/v1/speak?model=${dVoice}`, {
                                        method: "POST", headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: textForAudio })
                                    }).then(async dRes => {
                                        if (dRes.ok) {
                                            const arrayBuffer = await dRes.arrayBuffer();
                                            return Buffer.from(arrayBuffer).toString('base64');
                                        }
                                        return null;
                                    }).catch(() => null);
                                }
                        }
                    }

                    const [pronunResult, ttsResult] = await Promise.all([pronunPromise, ttsPromise]);
                    finalPronunciation = pronunResult;
                    base64Audio = ttsResult;

                    safeSend(ws, { 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        detected_lang: finalOutputLang, 
                        audio: base64Audio,
                        pronunciation: finalPronunciation 
                    });
                } catch (error) {
                    safeSend(ws, { type: 'full_response', user_text: userText || "...", ai_text: "Vuelve a intentarlo...", detected_lang: codeA, audio: null });
                }
            }
            
            // 📝 INICIO DE ENTRADA DE TEXTO
            else if (data.type === 'text_input' || data.type === 'free_text_input') {
                const isFreeMode = data.type === 'free_text_input';
                try {
                    if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                    let temp = 0.0;
                    let maxTokens = 200;

                    // 🔥 INSTRUCCIONES ESTRICTAS: MODO ROBOT DE TRADUCCIÓN 🔥
                    const sysPrompt = `You are a dumb translation algorithm. You cannot chat, converse, or answer questions.
Task: Translate strictly between ${langNameA} (Code: ${codeA}) and ${langNameB} (Code: ${codeB}).

RULES:
1. Identify if the input is ${codeA} or ${codeB}. Translate to the OTHER language.
2. Format response EXACTLY as: [TARGET_CODE]Translated text
3. DO NOT ANSWER QUESTIONS. If input is "How are you?" or "What's your name?", TRANSLATE the question.
4. NO conversational text, NO arrows, NO notes.
5. If input is unintelligible gibberish, return EXACTLY: [${codeA}]Vuelve a intentarlo...`;

                    let aiTextRaw = "";

                    // 🔥 GROQ COMO MOTOR PRINCIPAL 🔥
                    try {
                        let response = await groq.chat.completions.create({
                            messages: [{role: "system", content: data.tone || sysPrompt}, {role: "user", content: data.text}], 
                            model: "llama-3.3-70b-versatile", stream: false, temperature: temp, max_tokens: maxTokens 
                        });
                        aiTextRaw = response.choices[0]?.message?.content || "";
                        
                        // 🛡️ DETECTOR UNIVERSAL DE ALUCINACIONES
                        if (aiTextRaw.length > 0 && !/\p{L}|\p{N}/u.test(aiTextRaw)) {
                            console.log("⚠️ Groq alucinó con puntuación en texto. Pasando a Gemini...");
                            throw new Error("Groq returned only punctuation");
                        }
                    } catch (groqError) {
                        // 🔥 GEMINI 3.1 FLASH-LITE EN ACCIÓN SI GROQ FALLA O DEVUELVE "." 🔥
                        aiTextRaw = await askGemini(data.text, data.tone || sysPrompt);
                    }

                    aiTextRaw = sanitizeAiResponse(aiTextRaw);
                    
                    if (!aiTextRaw || !/\p{L}|\p{N}/u.test(aiTextRaw)) {
                         return safeSend(ws, { type: 'full_response', user_text: data.text, ai_text: "Vuelve a intentarlo...", detected_lang: codeA, audio: null });
                    }

                    // 🔥 EXTRACCIÓN DEL CÓDIGO INVISIBLE PARA NO CRUZAR ACENTOS 🔥
                    let finalOutputLang = codeA;
                    let aiText = aiTextRaw;
                    const langMatch = aiTextRaw.match(/^\[([a-zA-Z-]+)\]\s*(.*)/s);
                    if (langMatch) {
                        finalOutputLang = langMatch[1];
                        aiText = langMatch[2].trim();
                    } else {
                        finalOutputLang = detectLanguageServer(aiTextRaw, codeA, codeB);
                    }
                    
                    let base64Audio = null;
                    let finalPronunciation = null;

                    let pronunPromise = Promise.resolve(null);
                    let ttsPromise = Promise.resolve(null);

                    if (data.wants_pronunciation && data.live_key !== LIVE_SECRET_KEY) {
                        const userNativeLang = (finalOutputLang === codeA) ? langNameB : langNameA;
                        pronunPromise = getPronunciation(aiText, userNativeLang);
                    }
                    
                    if (!isFreeMode && data.live_key === LIVE_SECRET_KEY) {
                        let activeVoice = finalOutputLang === codeA 
                            ? (data.myVoice || { provider: 'native', id: 'native' }) 
                            : (data.targetVoice || { provider: 'native', id: 'native' });

                        if (activeVoice.provider !== 'native' && activeVoice.provider !== 'free') {
                            if (activeVoice.provider === 'deepgram') {
                                const tLang = finalOutputLang.substring(0, 2).toLowerCase();
                                const maleIds = ['premium_male', 'gemini_male', 'aura-orion-en', 'aura-2-alvaro-es', 'aura-2-hector-fr', 'aura-2-fabian-de', 'aura-2-cesare-it', 'aura-2-ebisu-ja'];
                                const isMale = maleIds.includes(activeVoice.id);
                                
                                let dVoice = "aura-asteria-en"; 
                                if (tLang === 'en') dVoice = isMale ? "aura-orion-en" : "aura-asteria-en";
                                else if (tLang === 'es') dVoice = isMale ? "aura-2-alvaro-es" : "aura-2-carina-es";
                                else if (tLang === 'fr') dVoice = isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr"; 
                                else if (tLang === 'de') dVoice = isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de"; 
                                else if (tLang === 'it') dVoice = isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it"; 
                                else if (tLang === 'nl') dVoice = "aura-2-beatrix-nl"; 
                                else if (tLang === 'ja') dVoice = isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja"; 

                                let textForAudio = aiText.replace(/\|\|\|/g, ' ').replace(/###/g, '').replace(/["']/g, '').trim();

                                ttsPromise = fetch(`https://api.deepgram.com/v1/speak?model=${dVoice}`, {
                                    method: "POST", headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: textForAudio })
                                }).then(async dRes => {
                                    if (dRes.ok) {
                                        const arrayBuffer = await dRes.arrayBuffer();
                                        return Buffer.from(arrayBuffer).toString('base64');
                                    }
                                    return null;
                                }).catch(() => null);
                            }
                        }
                    }

                    const [pronunResult, ttsResult] = await Promise.all([pronunPromise, ttsPromise]);
                    finalPronunciation = pronunResult;
                    base64Audio = ttsResult;

                    safeSend(ws, { 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        detected_lang: finalOutputLang, 
                        audio: base64Audio,
                        pronunciation: finalPronunciation 
                    });
                } catch(e) {
                    safeSend(ws, { type: 'full_response', user_text: data.text || "...", ai_text: "Vuelve a intentarlo...", detected_lang: codeA, audio: null });
                }
            }
            
            // INICIO DE ENTRADA DE IMAGEN (Usando Gemini 3.1 Flash-Lite multimodal)
            else if (data.type === 'image_translation') {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
                    const payload = {
                        contents: [{
                            parts: [
                                { text: `You are a professional translator. Extract the main visible text from this image and translate it to ${data.langTarget || 'Spanish'}. Return ONLY a valid JSON object in this exact format: {"original": "Text found", "translated": "Translated text"}` },
                                { inlineData: { mimeType: "image/jpeg", data: data.image } }
                            ]
                        }],
                        generationConfig: { temperature: 0.1 }
                    };

                    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                    if (!res.ok) throw new Error("Fallo en la lectura de la imagen");
                    
                    const geminiData = await res.json();
                    let jsonStr = geminiData.candidates[0].content.parts[0].text.trim().replace(/```json/g, '').replace(/```/g, '').trim();
                    const resultObj = JSON.parse(jsonStr);
                    
                    safeSend(ws, { type: 'image_translation_result', original: resultObj.original, translated: resultObj.translated });
                } catch (error) {
                    safeSend(ws, { type: 'image_translation_error', message: "No se pudo detectar el texto." });
                }
            }
        } catch (e) {}
    });
});

