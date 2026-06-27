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

// 🔥 1. Creamos un servidor HTTP básico para que el host (Render) no lo duerma
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Servidor AlterEgo Activo 🚀\n');
});

// 🔥 2. Conectamos tu WebSocket a este servidor HTTP
const wss = new WebSocketServer({ server });

// 🔥 3. Hacemos que el servidor escuche el puerto
server.listen(PORT, () => {
    console.log(`🏆 SERVIDOR V163 (BLINDAJE TOTAL: OÍDOS Y CEREBRO): Puerto: ${PORT}`);
});

// 🔥 4. Auto-Ping cada 10 minutos (600,000 ms) para mantenerlo vivo
const RENDER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; 
setInterval(() => {
    fetch(RENDER_URL)
        .then(() => console.log('💓 Auto-ping: Servidor despierto'))
        .catch(() => console.log('⚠️ Fallo en auto-ping (normal si es localhost)'));
}, 600000);
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
                 
                 // 🔥 LÓGICA DE REEMBOLSO REESCRITA Y CORREGIDA 🔥
                 let realCredits = 0;
                 
                 try {
                     const res = await fetch(`https://alteregodb-1b8f3-default-rtdb.firebaseio.com/dynamic_config/packages.json`);
                     const firebaseData = await res.json();
                     if (firebaseData && firebaseData[productId] && firebaseData[productId].credits) {
                         realCredits = firebaseData[productId].credits;
                     } else {
                         // Valores por defecto por si falla Firebase (incluye estimaciones de suscripciones)
                         const defaultCredits = {
                             'starter_10_pack': 25,
                             'basic_30_pack': 180,
                             'pro_60_pack': 450,
                             'ultra_120_pack': 1000,
                             'weekly_pro': 15,   // Ajusta el nombre del ID si es distinto
                             'monthly_pro': 50   // Ajusta el nombre del ID si es distinto
                         };
                         if (defaultCredits[productId] !== undefined) {
                             realCredits = defaultCredits[productId];
                         }
                     }
                 } catch (err) {
                     console.error("🚨 [Webhook] Error leyendo dynamic_config:", err);
                 }

                 const snapshot = await userRef.once('value');
                 const userData = snapshot.val() || {};
                 let updates = {};

                 // 1. Si el producto reembolsado otorgaba créditos (paquete o suscripción), SE LOS QUITAMOS multiplicados por 60.
                 if (realCredits > 0) {
                     const unitsToRevoke = realCredits * 60;
                     let currentCredits = parseFloat(userData.credits) || 0;
                     updates.credits = currentCredits - unitsToRevoke;
                     console.log(`🚨 [RevenueCat] REEMBOLSO: Se quitaron ${unitsToRevoke} unidades (${realCredits} créditos) a ${safeUserId}.`);
                 }

                 // 2. Si NO es un paquete puro de créditos, asumimos que es una suscripción y le quitamos el VIP.
                 const pureCreditPacks = ['starter_10_pack', 'basic_30_pack', 'pro_60_pack', 'ultra_120_pack'];
                 if (!pureCreditPacks.includes(productId)) {
                     updates.isPro = false;
                     updates.pro_updated_at = Date.now();
                     console.log(`❌ [RevenueCat] VIP revocado a ${safeUserId} (Motivo: ${event.cancel_reason}).`);
                 }

                 // Actualizamos la base de datos con todo de un solo golpe
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

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 
const SIMULATOR_SECRET_KEY = "ALTER_ROLEPLAY_SECRET_2026";
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

// 🔥 LISTA VIP PARA WHISPER 
const WHISPER_LANGUAGES = [
    'pt-BR', 'zh-CN', 'ar', 'pt-PT', 'eu', 'gl', 'hr', 'sr', 'is', 'ga', 'cy', 'mt', 'sq', 'mk', 'bs', 'be', 'lb', 'zh-TW', 
    'tl', 'my', 'km', 'lo', 'ne', 'si', 'mn', 'kk', 'uz', 'ky', 'tg', 'he', 'fa', 'ps', 'ku', 'hy', 'az', 'ka', 'bn', 'pa', 
    'ta', 'te', 'mr', 'ur', 'gu', 'kn', 'ml', 'sw', 'am', 'so', 'zu', 'xh', 'af', 'yo', 'ig', 'ha', 'ht', 'gn', 'qu', 'eo', 
    'la', 'mg', 'mi', 'sm', 'haw', 'jw', 'su', 'yi'
];

// 🔥 LISTA DESTRUCTORA DE ALUCINACIONES 🔥
const WHISPER_HALLUCINATIONS = [
    "subtítulos", "subtitulos", "amara.org", "gracias por ver", "thanks for watching", 
    "suscríbete", "subscribe", "♪", "🎵", "🎶", "[música]", "(música)", "[music]", "(music)",
    "[silencio]", "(silencio)", "traducido por", "translated by", "youtu.be", ".com", 
    "www.", "televisión española", "derechos de autor", "copyright", "subtítulos realizados",
    "subs by", "amara", "subs:", "subtítulos:", "si hay silencio", "devuelve un texto", "vacío",
    "如果没有声音", "如果没有声音", "返回空文本", "if there is no clear human speech", "empty string",
    "el asiento ahora es impecable", "cámara de diputados", "república de chile", "de cierta manera"
];

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
    
    // Quitar etiquetas XML
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

// 🔥 AQUÍ SE APLICÓ EL CANDADO DEFINITIVO CONTRA EL "YELO" Y ERRORES 🔥
async function getPronunciation(textToPronounce, userNativeLanguage) {
    if (!textToPronounce || textToPronounce.length > 500) return null; 
    try {
        const prompt = `Escribe la pronunciación figurada exacta de "${textToPronounce}" para que un hablante nativo de ${userNativeLanguage} lo lea en voz alta.

        REGLAS IRROMPIBLES:
        1. SOLO devuelve la pronunciación. CERO explicaciones, CERO símbolos fonéticos (como /ʃ/ o [ɛ]).
        2. Usa EXCLUSIVAMENTE el abecedario normal de ${userNativeLanguage}.
        3. Si ${userNativeLanguage} es Español y el texto es Inglés: 
           - La "H" aspirada inicial ("Hello", "How", "Here") SE ESCRIBE SIEMPRE CON "J" (Ej: "Jelóu", "Jáu", "Jíir"). 
           - ¡ESTÁ ESTRICTAMENTE PROHIBIDO ESCRIBIR "Yelo", "Elo" o "Helo"!
           - Usa tildes para marcar la fuerza de voz (ej: Jelóu).
        4. No uses comillas en tu respuesta.

        Texto: "${textToPronounce}"`;

        const response = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            max_tokens: 150,
            stream: false
        });
        
        let pronun = response.choices[0]?.message?.content || "";
        // Limpieza profunda de cualquier símbolo raro que la IA intente colar
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
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) realCredits = parseFloat(userData.credits);
                    } catch (err) {}
                }
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            // 🔥 RUTA PARA COBRAR Y GENERAR EL PRIMER SALUDO (OBEDECE AL BOTÓN) 🔥
            if (data.type === 'tts_request') {
                if (data.simulator_key === SIMULATOR_SECRET_KEY && data.voice_engine && data.voice_engine !== 'free') {
                    try {
                        let textForAudioGreeting = data.text;
                        const validVoice = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'nova';
                        const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 
                        
                        const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                            body: JSON.stringify({ model: "tts-1", input: textForAudioGreeting, voice: validVoice, speed: voiceSpeed })
                        });
                        
                        if (ttsResponse.ok) {
                            const arrayBuffer = await ttsResponse.arrayBuffer();
                            const base64Audio = Buffer.from(arrayBuffer).toString('base64');
                            ws.send(JSON.stringify({ type: 'full_response', user_text: null, ai_text: data.text, audio: base64Audio }));
                        } else {
                            ws.send(JSON.stringify({ type: 'full_response', user_text: null, ai_text: data.text, audio: null }));
                        }
                    } catch (err) { console.error("Error TTS Request:", err.message); }
                }
                return;
            }

            // 🔥 RUTA DE ANÁLISIS GRAMATICAL (AHORA BLINDADA CON OPENAI) 🔥
            if (data.type === 'analyze_grammar') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                try {
                    const prompt = `Eres un experto profesor de idiomas. Lee la siguiente conversación entre un estudiante (Yo) y un simulador (IA). 
                    Tu trabajo es evaluar ÚNICAMENTE las frases del estudiante ("Yo dije").
                    Detecta errores gramaticales, errores de vocabulario o expresiones poco naturales.
                    Si el estudiante lo hizo bien, felicítalo. Si cometió errores, explícalos de forma amable en español y dale la forma correcta.
                    Sé conciso, claro y directo. Usa viñetas para que sea fácil de leer.
                    
                    Conversación Reciente:
                    ${data.text}`;

                    let grammarFeedback = "";
                    try {
                        const completion = await groq.chat.completions.create({
                            messages: [{ role: "user", content: prompt }],
                            model: "llama-3.3-70b-versatile",
                            temperature: 0.5,
                            max_tokens: 500
                        });
                        grammarFeedback = completion.choices[0]?.message?.content;
                    } catch (groqError) {
                        console.log("⚠️ Groq falló en análisis gramatical. Usando OpenAI...");
                        const completion = await openai.chat.completions.create({
                            messages: [{ role: "user", content: prompt }],
                            model: "gpt-4o-mini", // Plan B ultra eficiente
                            temperature: 0.5,
                            max_tokens: 500
                        });
                        grammarFeedback = completion.choices[0]?.message?.content;
                    }

                    ws.send(JSON.stringify({ 
                        type: 'grammar_analysis_result', 
                        feedback: grammarFeedback || "Análisis fallido." 
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'grammar_analysis_error' }));
                }
                return;
            }

            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);
            const scenarioId = data.scenario_id || 'teacher';
            const voiceEngine = data.voice_engine || 'free'; 

            // =================================================================
            // 🎙️ MODO AUDIO (RUTAS: audio_input y free_audio_input)
            // =================================================================
            if (data.type === 'audio_input' || data.type === 'free_audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                const isFreeMode = data.type === 'free_audio_input';
                let userText = "";
                let detectedCode = codeB; 

                const useWhisper = WHISPER_LANGUAGES.includes(codeA) || WHISPER_LANGUAGES.includes(codeB);

                try {
                    const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.m4a`);
                    fs.writeFileSync(tempFilePath, audioBuffer);

                    if (isFreeMode) {
                        console.log(`🎧 [MODO GRATIS] Usando GROQ Whisper`);
                        // 🔥 BLINDAJE DE OÍDOS PARA EL MODO GRATIS 🔥
                        try {
                            const whisperResponse = await groq.audio.transcriptions.create({
                                file: fs.createReadStream(tempFilePath),
                                model: 'whisper-large-v3-turbo',
                                prompt: "Clean transcription. No hallucinations. Do not write anything if it is just silence.",
                                temperature: 0.0
                            });
                            userText = whisperResponse.text.trim();
                        } catch (groqAudioErr) {
                            console.log("⚠️ Groq Whisper falló (Modo Gratis). Rescatando con OpenAI Whisper...");
                            const whisperResponse = await openai.audio.transcriptions.create({
                                file: fs.createReadStream(tempFilePath),
                                model: 'whisper-1',
                                temperature: 0.0,
                                condition_on_previous_text: false 
                            });
                            userText = whisperResponse.text.trim();
                        }
                    } else {
                        // 🎙️ OPENAI PARA TRANSCRIPCIONES INTACTO 🎙️
                        if (useWhisper) {
                            console.log(`🎧 [MODO PRO] Usando OPENAI WHISPER (${codeA} / ${codeB})`);
                            const whisperResponse = await openai.audio.transcriptions.create({
                                file: fs.createReadStream(tempFilePath),
                                model: 'whisper-1',
                                temperature: 0.0, 
                                condition_on_previous_text: false 
                            });
                            userText = whisperResponse.text.trim();
                        } else {
                            console.log(`🎧 [MODO PRO] Usando DEEPGRAM (${codeA} / ${codeB})`);
                            // 🔥 BLINDAJE DE OÍDOS PARA EL MODO PRO (FALLBACK) 🔥
                            try {
                                const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                                    audioBuffer, { model: "nova-2", detect_language: [codeA, codeB], smart_format: true, punctuate: true, utterances: true, mimetype: 'audio/mp4' }
                                );
                                if (error) throw new Error("Deepgram devolvió un error");
                                userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim();
                                detectedCode = result.results?.channels[0]?.alternatives[0]?.detected_language || codeB; 
                            } catch (deepgramError) {
                                console.log(`⚠️ [ALERTA] El oído principal (Deepgram) falló. Activando oído de rescate (OpenAI Whisper)...`);
                                const whisperFallbackResponse = await openai.audio.transcriptions.create({
                                    file: fs.createReadStream(tempFilePath),
                                    model: 'whisper-1',
                                    temperature: 0.0, 
                                    condition_on_previous_text: false 
                                });
                                userText = whisperFallbackResponse.text.trim();
                            }
                        }
                    }

                    fs.unlinkSync(tempFilePath); 

                    const textLower = userText.toLowerCase();
                    const isHallucination = WHISPER_HALLUCINATIONS.some(h => textLower.includes(h));
                    if (isHallucination) userText = ""; 

                    if (userText && userText.length <= 2 && !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(userText)) {
                        userText = "";
                    }

                    if (!userText || userText.length < 1) {
                        ws.send(JSON.stringify({ type: 'error_audio_empty' }));
                        return;
                    }
                    
                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    let groqMessages = [];
                    let temp = 0.0;
                    let maxTokens = 500;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        let personalityPrompt = data.tone;
                        
                        if (scenarioId === 'strict') {
                            const userRole = data.custom_role || "a native person from the country of the target language";
                            personalityPrompt += `
CRITICAL INSTRUCTION: You are an actor in a "Real Life Simulator". The user is practicing ${langNameB}.
YOUR SPECIFIC ROLE: Act exactly like ${userRole}.
MANDATORY RULES:
1. 100% IMMERSION: You MUST communicate ONLY in ${langNameB}. Never speak in ${langNameA}.
2. ADAPTIVE ROLEPLAY: The user will start the situation. Play along realistically according to your assigned role.
3. BE HELPFUL BUT IN CHARACTER: If the user struggles or makes a mistake, guide them gently without breaking your role. 
4. Keep it short, realistic, and highly conversational (1 or 2 sentences maximum).`;

                        } else if (scenarioId === 'teacher') {
                            personalityPrompt += `
CRITICAL INSTRUCTION: You are an elite, patient, and highly intelligent language teacher.
User's Native Language (Language A): ${langNameA}
Language to Teach (Language B): ${langNameB}

CORE LOGIC:
1. IF THE USER ASKS A QUESTION (e.g., "Why?", "Explain...", "How do I use...", or grammar doubts):
   - STOP using the 3-block rule.
   - Respond as a human teacher in ${langNameA}.
   - Provide a clear, friendly explanation and use examples to clarify.

2. IF THE USER WANTS TO TRANSLATE A PHRASE OR JUST SAYS A WORD:
   - Use THE 3 BLOCKS RULE strictly:
     - BLOCK 1 (NATIVE): Enclose in ###. 100% in ${langNameA}. (Example: ###Hola###)
     - BLOCK 2 (TARGET): Enclose in |||. 100% in ${langNameB}. (Example: |||Hello|||)
     - BLOCK 3 (PHONETIC): Enclose in ~~~. Phonetic of B using A's alphabet. (Example: ~~~jelou~~~)

3. NEVER mix characters of Language B inside the ### blocks.
4. If the user makes a mistake in Language B, correct them and explain why in ${langNameA}.

FORMAT FOR TRANSLATIONS:
Para decir ###[Frase en A]### debes decir |||[Frase en B]||| ~~~[Pronunciación]~~~. 

GOAL: Be helpful, pedagogical, and adaptive.`;

                        } else {
                            personalityPrompt += `
CRITICAL INSTRUCTION: You are roleplaying a character. The user is practicing ${langNameB}.
MANDATORY RULES:
1. YOU MUST RESPOND 100% IN ${langNameB} SCRIPT ONLY.
2. ABSOLUTELY NO ${langNameA}. ABSOLUTELY NO RUSSIAN (unless the target language is Russian). NO OTHER LANGUAGES.
3. Stay in character (e.g., Immigration Officer, Interviewer, Waiter). Do not act like a teacher.
4. Keep responses short, immersive, and natural (1 or 2 sentences).`;
                        }

                        groqMessages.push({ role: "system", content: personalityPrompt });
                        
                        if (data.history && Array.isArray(data.history)) {
                            const safeHistory = data.history.slice(-6); 
                            safeHistory.forEach(msg => {
                                if (msg.text && (msg.role === 'user' || msg.role === 'ai')) {
                                    groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                                }
                            });
                        }
                        temp = 0.1; 
                        maxTokens = 200;
                    } else {
                        groqMessages.push({ 
                            role: "system", 
                            content: `You are a pure, machine-like translation API translating between ${langNameA} and ${langNameB}.
CRITICAL RULES:
1. Detect the input language and translate it directly into the OTHER language.
2. OUTPUT ONLY THE TRANSLATED TEXT. NO CONVERSATION.
3. ABSOLUTELY NO explanations, NO notes, NO apologies.
4. If the input is gibberish, random letters, or typos (e.g. 'Bjaj', 'Hhakk', 'Uahq'), JUST RETURN THE EXACT SAME GIBBERISH. DO NOT say 'No translation available' or explain that it is invalid. NEVER refuse to translate.
5. If the input is mixed languages (Spanglish) or bad grammar, translate it directly without correcting the user or adding notes.
6. Your entire response must be just the final translation.` 
                        });
                        temp = 0.1;
                    }

                    groqMessages.push({ role: "user", content: userText });

                    let stream;
                    // 🔥 BLINDAJE DE CEREBRO: Groq -> OpenAI 🔥
                    try {
                        stream = await groq.chat.completions.create({
                            messages: groqMessages,
                            model: "llama-3.3-70b-versatile",
                            temperature: temp,
                            max_tokens: maxTokens, 
                            stream: true
                        });
                    } catch (groqError) {
                        console.log("⚠️ [ALERTA] Cerebro Groq falló (Audio). Activando Cerebro de Rescate OpenAI...");
                        stream = await openai.chat.completions.create({
                            messages: groqMessages,
                            model: "gpt-4o-mini", // Rápido y efectivo para esto
                            temperature: temp,
                            max_tokens: maxTokens,
                            stream: true
                        });
                    }
                    
                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        aiText += content;
                    }

                    aiText = sanitizeAiResponse(aiText);
                    if (!aiText) return;

                    console.log(`🧠 [Respuesta IA]: "${aiText}"`);

                    let base64Audio = null;
                    let finalOutputLang = detectLanguageServer(aiText, codeA, codeB);
                    
                    // =================================================================
                    // 🔥 TTS MOTOR HÍBRIDO + BLINDAJE (AUDIO MODO) 🔥
                    // =================================================================
                    const isSimulatorAudio = (!isFreeMode && data.simulator_key === SIMULATOR_SECRET_KEY && data.voice_engine && data.voice_engine !== 'free');
                    const isLiveAudio = (!isFreeMode && data.live_key === LIVE_SECRET_KEY);

                    if (isSimulatorAudio || isLiveAudio) {
                        try {
                            let textForAudio = aiText
                                .replace(/\|\|\|/g, ' ') 
                                .replace(/###/g, '')     
                                .replace(/~~~[\s\S]*?~~~/g, '') 
                                .replace(/["']/g, '')    
                                .trim();

                            let ttsSuccess = false;
                            let currentEngine = 'none';
                            let deepgramVoiceId = "aura-asteria-en";
                            let openaiVoiceId = "nova";

                            // LÓGICA DEL SIMULADOR ORIGINAL (NO SE TOCA)
                            if (isSimulatorAudio) {
                                currentEngine = data.voice_engine;
                                const tLang = codeB.substring(0, 2).toLowerCase();
                                const isMale = (data.openai_voice === 'onyx' || data.openai_voice === 'echo');
                                
                                if (tLang === 'en') deepgramVoiceId = isMale ? "aura-orion-en" : "aura-asteria-en";
                                else if (tLang === 'es') deepgramVoiceId = isMale ? "aura-2-alvaro-es" : "aura-2-carina-es";
                                else if (tLang === 'fr') deepgramVoiceId = isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr"; 
                                else if (tLang === 'de') deepgramVoiceId = isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de"; 
                                else if (tLang === 'it') deepgramVoiceId = isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it"; 
                                else if (tLang === 'nl') deepgramVoiceId = "aura-2-beatrix-nl"; 
                                else if (tLang === 'ja') deepgramVoiceId = isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja"; 

                                openaiVoiceId = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'nova';
                            } 
                            // LÓGICA DE TU LIVESCREEN CON DEEPGRAM
                            else if (isLiveAudio) {
                                let selectedVoiceObj = null;
                                const prefixOut = finalOutputLang.split('-')[0];
                                const prefixA = codeA.split('-')[0];
                                
                                if (prefixOut === prefixA) {
                                    selectedVoiceObj = data.myVoice;
                                } else {
                                    selectedVoiceObj = data.targetVoice;
                                }

                                if (selectedVoiceObj && selectedVoiceObj.provider !== 'native') {
                                    currentEngine = selectedVoiceObj.provider;
                                    if (currentEngine === 'deepgram') {
                                        deepgramVoiceId = selectedVoiceObj.id; // ¡Aquí usamos la voz HD de tu LiveScreen!
                                    } else if (currentEngine === 'openai') {
                                        openaiVoiceId = selectedVoiceObj.id;
                                    }
                                }
                            }

                            if (currentEngine === 'deepgram') {
                                try {
                                    const dUrl = `https://api.deepgram.com/v1/speak?model=${deepgramVoiceId}`;
                                    const dRes = await fetch(dUrl, {
                                        method: "POST",
                                        headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
                                        body: JSON.stringify({ text: textForAudio })
                                    });
                                    
                                    if (dRes.ok) {
                                        base64Audio = Buffer.from(await dRes.arrayBuffer()).toString('base64');
                                        ttsSuccess = true;
                                    } else {
                                        console.log(`⚠️ Deepgram falló para ${deepgramVoiceId}, activando OpenAI al rescate...`);
                                    }
                                } catch (e) {
                                    console.log("⚠️ Red de Deepgram caída, activando OpenAI al rescate...");
                                }
                            }

                            if (currentEngine === 'openai' || (currentEngine === 'deepgram' && !ttsSuccess)) {
                                try {
                                    const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 
                                    const oRes = await fetch("https://api.openai.com/v1/audio/speech", {
                                        method: "POST",
                                        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                        body: JSON.stringify({ model: "tts-1", input: textForAudio, voice: openaiVoiceId, speed: voiceSpeed })
                                    });
                                    
                                    if (oRes.ok) {
                                        base64Audio = Buffer.from(await oRes.arrayBuffer()).toString('base64');
                                    } 
                                } catch (e) { console.error("OpenAI Network Error:", e.message); }
                            }

                        } catch (err) { console.error("Error crítico TTS Audio:", err.message); }
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', user_text: userText, ai_text: aiText, detected_lang: detectedCode, audio: base64Audio 
                    }));

                } catch (error) { console.error("❌ Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (RUTAS: text_input y free_text_input)
            // =================================================================
            else if (data.type === 'text_input' || data.type === 'free_text_input') {
                const isFreeMode = data.type === 'free_text_input';
                try {
                    let groqMessages = [];
                    let temp = 0.0;
                    let maxTokens = 500;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        
                        let personalityPrompt = data.tone;
                        
                        if (scenarioId === 'strict') {
                            const userRole = data.custom_role || "a native person from the country of the target language";
                            personalityPrompt += `
CRITICAL INSTRUCTION: You are an actor in a "Real Life Simulator". The user is practicing ${langNameB}.
YOUR SPECIFIC ROLE: Act exactly like ${userRole}.
MANDATORY RULES:
1. 100% IMMERSION: You MUST communicate ONLY in ${langNameB}. Never speak in ${langNameA}.
2. ADAPTIVE ROLEPLAY: The user will start the situation. Play along realistically according to your assigned role.
3. BE HELPFUL BUT IN CHARACTER: If the user struggles or makes a mistake, guide them gently without breaking your role. 
4. Keep it short, realistic, and highly conversational (1 or 2 sentences maximum).`;

                        } else if (scenarioId === 'teacher') {
                            personalityPrompt += `
CRITICAL INSTRUCTION: You are an elite, patient, and highly intelligent language teacher.
User's Native Language (Language A): ${langNameA}
Language to Teach (Language B): ${langNameB}

CORE LOGIC:
1. IF THE USER ASKS A QUESTION (e.g., "Why?", "Explain...", "How do I use...", or grammar doubts):
   - STOP using the 3-block rule.
   - Respond as a human teacher in ${langNameA}.
   - Provide a clear, friendly explanation and use examples to clarify.

2. IF THE USER WANTS TO TRANSLATE A PHRASE OR JUST SAYS A WORD:
   - Use THE 3 BLOCKS RULE strictly:
     - BLOCK 1 (NATIVE): Enclose in ###. 100% in ${langNameA}. (Example: ###Hola###)
     - BLOCK 2 (TARGET): Enclose in |||. 100% in ${langNameB}. (Example: |||Hello|||)
     - BLOCK 3 (PHONETIC): Enclose in ~~~. Phonetic of B using A's alphabet. (Example: ~~~jelou~~~)

3. NEVER mix characters of Language B inside the ### blocks.
4. If the user makes a mistake in Language B, correct them and explain why in ${langNameA}.

FORMAT FOR TRANSLATIONS:
Para decir ###[Frase en A]### debes decir |||[Frase en B]||| ~~~[Pronunciación]~~~. 

GOAL: Be helpful, pedagogical, and adaptive.`;

                        } else {
                            personalityPrompt += `
CRITICAL INSTRUCTION: You are roleplaying a character. The user is practicing ${langNameB}.
MANDATORY RULES:
1. YOU MUST RESPOND 100% IN ${langNameB} SCRIPT ONLY.
2. ABSOLUTELY NO ${langNameA}. ABSOLUTELY NO RUSSIAN (unless the target language is Russian). NO OTHER LANGUAGES.
3. Stay in character (e.g., Immigration Officer, Interviewer, Waiter). Do not act like a teacher.
4. Keep responses short, immersive, and natural (1 or 2 sentences).`;
                        }

                        groqMessages.push({ role: "system", content: personalityPrompt });
                        
                        if (data.history && Array.isArray(data.history)) {
                            data.history.slice(-6).forEach(msg => {
                                if (msg.text) groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                            });
                        }
                        temp = 0.1;
                        maxTokens = 200;
                    } else {
                        groqMessages.push({ 
                            role: "system", 
                            content: `You are a pure, machine-like translation API translating between ${langNameA} and ${langNameB}.
CRITICAL RULES:
1. Detect the input language and translate it directly into the OTHER language.
2. OUTPUT ONLY THE TRANSLATED TEXT. NO CONVERSATION.
3. ABSOLUTELY NO explanations, NO notes, NO apologies.
4. If the input is gibberish, random letters, or typos (e.g. 'Bjaj', 'Hhakk', 'Uahq'), JUST RETURN THE EXACT SAME GIBBERISH. DO NOT say 'No translation available' or explain that it is invalid. NEVER refuse to translate.
5. If the input is mixed languages (Spanglish) or bad grammar, translate it directly without correcting the user or adding notes.
6. Your entire response must be just the final translation.` 
                        });
                        temp = 0.1;
                    }

                    groqMessages.push({ role: "user", content: data.text });

                    let stream;
                    // 🔥 BLINDAJE DE CEREBRO: Groq -> OpenAI 🔥
                    try {
                        stream = await groq.chat.completions.create({
                            messages: groqMessages,
                            model: "llama-3.3-70b-versatile", 
                            stream: true,
                            temperature: temp,
                            max_tokens: maxTokens 
                        });
                    } catch (groqError) {
                        console.log("⚠️ [ALERTA] Cerebro Groq falló (Texto). Activando Cerebro de Rescate OpenAI...");
                        stream = await openai.chat.completions.create({
                            messages: groqMessages,
                            model: "gpt-4o-mini", // Rápido y efectivo para esto
                            temperature: temp,
                            max_tokens: maxTokens,
                            stream: true
                        });
                    }

                    let aiText = "";
                    for await (const chunk of stream) { 
                        const content = chunk.choices[0]?.delta?.content || ""; 
                        aiText += content; 
                    }
                    
                    aiText = sanitizeAiResponse(aiText);
                    
                    let base64Audio = null;
                    let finalOutputLang = detectLanguageServer(aiText, codeA, codeB);
                    
                    // =================================================================
                    // 🔥 TTS MOTOR HÍBRIDO + BLINDAJE (TEXTO MODO) 🔥
                    // =================================================================
                    const isSimulatorText = (!isFreeMode && data.simulator_key === SIMULATOR_SECRET_KEY && data.voice_engine && data.voice_engine !== 'free');
                    const isLiveText = (!isFreeMode && data.live_key === LIVE_SECRET_KEY);

                    if (isSimulatorText || isLiveText) {
                        try {
                            let textForAudio = aiText
                                .replace(/\|\|\|/g, ' ') 
                                .replace(/###/g, '')     
                                .replace(/~~~[\s\S]*?~~~/g, '') 
                                .replace(/["']/g, '')    
                                .trim();

                            let ttsSuccess = false;
                            let currentEngine = 'none';
                            let deepgramVoiceId = "aura-asteria-en";
                            let openaiVoiceId = "nova";

                            // LÓGICA DEL SIMULADOR ORIGINAL
                            if (isSimulatorText) {
                                currentEngine = data.voice_engine;
                                const tLang = codeB.substring(0, 2).toLowerCase();
                                const isMale = (data.openai_voice === 'onyx' || data.openai_voice === 'echo');
                                
                                if (tLang === 'en') deepgramVoiceId = isMale ? "aura-orion-en" : "aura-asteria-en";
                                else if (tLang === 'es') deepgramVoiceId = isMale ? "aura-2-alvaro-es" : "aura-2-carina-es";
                                else if (tLang === 'fr') deepgramVoiceId = isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr"; 
                                else if (tLang === 'de') deepgramVoiceId = isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de"; 
                                else if (tLang === 'it') deepgramVoiceId = isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it"; 
                                else if (tLang === 'nl') deepgramVoiceId = "aura-2-beatrix-nl"; 
                                else if (tLang === 'ja') deepgramVoiceId = isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja"; 

                                openaiVoiceId = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'nova';
                            }
                            // LÓGICA DE TU LIVESCREEN CON DEEPGRAM
                            else if (isLiveText) {
                                let selectedVoiceObj = null;
                                const prefixOut = finalOutputLang.split('-')[0];
                                const prefixA = codeA.split('-')[0];
                                
                                if (prefixOut === prefixA) {
                                    selectedVoiceObj = data.myVoice;
                                } else {
                                    selectedVoiceObj = data.targetVoice;
                                }

                                if (selectedVoiceObj && selectedVoiceObj.provider !== 'native') {
                                    currentEngine = selectedVoiceObj.provider;
                                    if (currentEngine === 'deepgram') {
                                        deepgramVoiceId = selectedVoiceObj.id;
                                    } else if (currentEngine === 'openai') {
                                        openaiVoiceId = selectedVoiceObj.id;
                                    }
                                }
                            }

                            if (currentEngine === 'deepgram') {
                                try {
                                    const dUrl = `https://api.deepgram.com/v1/speak?model=${deepgramVoiceId}`;
                                    const dRes = await fetch(dUrl, {
                                        method: "POST",
                                        headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
                                        body: JSON.stringify({ text: textForAudio })
                                    });
                                    
                                    if (dRes.ok) {
                                        base64Audio = Buffer.from(await dRes.arrayBuffer()).toString('base64');
                                        ttsSuccess = true;
                                    } else {
                                        console.log(`⚠️ Deepgram falló para ${deepgramVoiceId}, activando OpenAI al rescate...`);
                                    }
                                } catch (e) {
                                    console.log("⚠️ Red de Deepgram caída, activando OpenAI al rescate...");
                                }
                            }

                            if (currentEngine === 'openai' || (currentEngine === 'deepgram' && !ttsSuccess)) {
                                try {
                                    const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 
                                    const oRes = await fetch("https://api.openai.com/v1/audio/speech", {
                                        method: "POST",
                                        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                        body: JSON.stringify({ model: "tts-1", input: textForAudio, voice: openaiVoiceId, speed: voiceSpeed })
                                    });
                                    
                                    if (oRes.ok) {
                                        base64Audio = Buffer.from(await oRes.arrayBuffer()).toString('base64');
                                    } 
                                } catch (e) { console.error("OpenAI Network Error:", e.message); }
                            }

                        } catch (err) { console.error("Error crítico TTS Texto:", err.message); }
                    }

                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio: base64Audio }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }
            // FINAL DE ENTRADA DE TEXTO //
            
            // INICIO DE ENTRADA DE IMAGEN (image_translation) //
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
            // FINAL DE ENTRADA DE IMAGEN //
        } catch (e) {}
    });
});
// =================================================================
// 🚀 FINAL DE CONEXIÓN WEBSOCKET PRINCIPAL 🚀
// =================================================================
