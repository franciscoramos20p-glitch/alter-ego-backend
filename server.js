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
import crypto from 'crypto'; // 🔥 FIX 2: Necesario para generar nombres seguros

// =================================================================
// 🚨 CAZADORES DE ERRORES GLOBALES PARA LA TERMINAL DE RENDER 🚨
// =================================================================
process.on('uncaughtException', (err) => {
    console.error('🚨 [ERROR CRÍTICO NO ATRAPADO]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 [PROMESA RECHAZADA NO MANEJADA]:', reason);
});

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

const app = express();
app.use(bodyParser.json()); 

app.get('/', (req, res) => {
    res.status(200).send('Servidor AlterEgo Activo 🚀\n');
});

// =================================================================
// 💰 WEBHOOK DE REVENUECAT (EL VERDUGO)
// =================================================================
app.post('/webhook-revenuecat', async (req, res) => {
    
    // 🔥 FIX 1: SEGURIDAD CRÍTICA. Evita que te falsifiquen compras.
    // En el panel de RevenueCat debes configurar este mismo token en "Authorization header"
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

        // 🔥 FILTRO ANTI-FANTASMAS
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
                 
                 await userRef.update({ isPro: false, pro_updated_at: Date.now() }); 
                 console.log(`❌ [RevenueCat] VIP revocado a ${safeUserId} (Motivo: ${event.cancel_reason}).`);
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

const server = app.listen(PORT, () => {
    console.log(`🏆 SERVIDOR V170: Puerto: ${PORT}`);
});

const wss = new WebSocketServer({ server });

const RENDER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; 
setInterval(() => {
    fetch(RENDER_URL).catch(() => {});
}, 600000);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 
const SIMULATOR_SECRET_KEY = "ALTER_ROLEPLAY_SECRET_2026";

// 🔥 INICIO DE CAMBIO 🔥: IDs de las Voces para el Enrutador
// =================================================================
// 🚨 CONFIGURACIÓN DE VOCES DEL SERVIDOR
// =================================================================

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']; // Voces nativas de Gemini

// 🔥 INICIO DE CAMBIO 🔥: Sincronización Total con Voices.js del Frontend
const DEEPGRAM_VOICES = [
    // Inglés
    'aura-2-asteria-en', 'aura-2-luna-en', 'aura-orion-en', 
    // Español
    'aura-luna-es', 'aura-orion-es', 'aura-2-carina-es', 'aura-2-alvaro-es',
    // Francés
    'aura-2-agathe-fr', 'aura-2-hector-fr',
    // Alemán
    'aura-2-aurelia-de', 'aura-2-fabian-de',
    // Italiano
    'aura-2-cinzia-it', 'aura-2-cesare-it',
    // Holandés
    'aura-2-beatrix-nl',
    // Japonés
    'aura-2-ama-ja', 'aura-2-ebisu-ja'
];
// 🔥 FIN DE CAMBIO 🔥

// 🤖 Helper Enrutador Dinámico de Audio (Devuelve Base64)
async function generateDynamicTTS(text, voiceId, speed = 1.0) {
    try {
        if (DEEPGRAM_VOICES.includes(voiceId)) {
            // Ruta Deepgram
            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${voiceId}`, {
                method: 'POST',
                headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer).toString('base64');
            }
            throw new Error("Deepgram no respondió correctamente.");

        } else if (GEMINI_VOICES.includes(voiceId)) {
            // Ruta Gemini (API de Audio Modalidad)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: text }] }],
                    generationConfig: { 
                        responseModalities: ["AUDIO"], 
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } } } 
                    }
                })
            });
            const data = await response.json();
            if (data.candidates && data.candidates[0].content.parts[0].inlineData) {
                return data.candidates[0].content.parts[0].inlineData.data; // Ya viene en Base64
            }
            throw new Error("Gemini no devolvió audio.");
        }

        // Fallback por defecto y Ruta OpenAI
        const validVoice = OPENAI_VOICES.includes(voiceId) ? voiceId : 'nova';
        const response = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "tts-1", input: text, voice: validVoice, speed: speed })
        });
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer).toString('base64');
        }
    } catch (error) {
        console.error("🚨 [ERROR EN ENRUTADOR TTS]:", error.message);
    }
    return null; // Si todo falla, devuelve null para que el frontend no rompa
}
// 🔥 FIN DE CAMBIO 🔥

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
    clean = clean.replace(/<([^>]+)>/g, "$1");
    return clean.trim();
}

// 🔥 FIX 3: FUNCIÓN SEGURA PARA ENVIAR WEBSOCKETS SIN CRASHEAR
function safeSend(ws, payload) {
    if (ws.readyState === 1) { // 1 significa WebSocket.OPEN
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

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

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

            if (data.type === 'tts_request') {
                if (data.simulator_key === SIMULATOR_SECRET_KEY && data.voice_engine && data.voice_engine !== 'free') {
                    try {
                        // 🔥 REGLA DE SEGURIDAD RESPETADA: Sólo cobra si mandas cost (ej. preview manda is_preview=true y cost=0)
                        if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                        let textForAudioGreeting = data.text;
                        const targetVoiceId = data.voice || data.openai_voice || 'nova'; 
                        const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 
                        
                        // 🔥 INICIO DE CAMBIO 🔥: Usando el enrutador central para la preview/greeting
                        const base64Audio = await generateDynamicTTS(textForAudioGreeting, targetVoiceId, voiceSpeed);
                        
                        safeSend(ws, { 
                            type: 'full_response', 
                            user_text: null, 
                            ai_text: data.text, 
                            audio: base64Audio 
                        });
                        // 🔥 FIN DE CAMBIO 🔥

                    } catch (err) {
                        console.error("Error en tts_request:", err);
                    }
                }
                return;
            }

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
                        const completion = await openai.chat.completions.create({
                            messages: [{ role: "user", content: prompt }],
                            model: "gpt-4o-mini",
                            temperature: 0.5,
                            max_tokens: 500
                        });
                        grammarFeedback = completion.choices[0]?.message?.content;
                    }

                    safeSend(ws, { 
                        type: 'grammar_analysis_result', 
                        feedback: grammarFeedback || "Análisis fallido." 
                    });
                } catch (error) {
                    safeSend(ws, { type: 'grammar_analysis_error' });
                }
                return;
            }

            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);
            const scenarioId = data.scenario_id || 'teacher';
            const voiceEngine = data.voice_engine || 'free'; 

            if (data.type === 'audio_input' || data.type === 'free_audio_input') {
                if (!data.payload) return;

                if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                const audioBuffer = Buffer.from(data.payload, 'base64');
                let userText = "";
                let detectedCode = codeB; 

                const useWhisper = WHISPER_LANGUAGES.includes(codeA) || WHISPER_LANGUAGES.includes(codeB);

                // 🔥 FIX 2: EVITAR CHOQUE DE ARCHIVOS 
                const randomId = crypto.randomBytes(4).toString('hex');
                const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}_${randomId}.m4a`);
                
                fs.writeFileSync(tempFilePath, audioBuffer);

                try {
                    if (useWhisper) {
                        const whisperResponse = await openai.audio.transcriptions.create({
                            file: fs.createReadStream(tempFilePath),
                            model: 'whisper-1',
                            prompt: "Do not transcribe silence. Do not output subtitles, translations, or copyright. Only output spoken words clearly.",
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
                            detectedCode = result.results?.channels[0]?.alternatives[0]?.detected_language || codeB; 
                        } catch (deepgramError) {
                            const whisperFallbackResponse = await openai.audio.transcriptions.create({
                                file: fs.createReadStream(tempFilePath),
                                model: 'whisper-1',
                                prompt: "Do not transcribe silence. Do not output subtitles, translations, or copyright. Only output spoken words clearly.",
                                temperature: 0.0, 
                                condition_on_previous_text: false 
                            });
                            userText = whisperFallbackResponse.text.trim();
                        }
                    }
                } finally {
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath); 
                    }
                }

                try {
                    const textLower = userText.toLowerCase();
                    const isHallucination = WHISPER_HALLUCINATIONS.some(h => textLower.includes(h));
                    if (isHallucination) userText = ""; 

                    if (userText && userText.length <= 2 && !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(userText)) {
                        userText = "";
                    }

                    if (!userText || userText.length < 1) {
                        safeSend(ws, { type: 'error_audio_empty' });
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
1. IF THE USER ASKS A QUESTION:
   - STOP using the 3-block rule.
   - Respond as a human teacher in ${langNameA}.
   - Provide a clear, friendly explanation and use examples to clarify.

2. IF THE USER WANTS TO TRANSLATE A PHRASE:
   - Use THE 3 BLOCKS RULE strictly:
     - BLOCK 1: Enclose in ###. 100% in ${langNameA}.
     - BLOCK 2: Enclose in |||. 100% in ${langNameB}.
     - BLOCK 3: Enclose in ~~~. Phonetic of B using A's alphabet.

3. NEVER mix characters of Language B inside the ### blocks.
4. If the user makes a mistake in Language B, correct them and explain why in ${langNameA}.`;

                        } else {
                            personalityPrompt += `
CRITICAL INSTRUCTION: You are roleplaying a character. The user is practicing ${langNameB}.
MANDATORY RULES:
1. YOU MUST RESPOND 100% IN ${langNameB} SCRIPT ONLY.
2. Stay in character. Do not act like a teacher.
3. Keep responses short, immersive, and natural.`;
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
2. OUTPUT ONLY THE TRANSLATED TEXT. NO CONVERSATION.` 
                        });
                        temp = 0.1;
                    }

                    groqMessages.push({ role: "user", content: userText });

                    let stream;
                    try {
                        stream = await groq.chat.completions.create({
                            messages: groqMessages,
                            model: "llama-3.3-70b-versatile",
                            temperature: temp,
                            // 🔥 INICIO DE CAMBIO 🔥: Código completado desde donde se te cortó ("max_to")
                            max_tokens: maxTokens,
                        });
                        
                        let aiText = stream.choices[0]?.message?.content || "";
                        aiText = sanitizeAiResponse(aiText);

                        // Enrutador de voces para el output principal
                        let audioBase64 = null;
                        if (voiceEngine !== 'free') {
                            const targetVoice = data.voice || 'nova';
                            const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0;
                            audioBase64 = await generateDynamicTTS(aiText, targetVoice, voiceSpeed);
                        }

                        safeSend(ws, { 
                            type: 'full_response', 
                            user_text: userText, 
                            ai_text: aiText, 
                            audio: audioBase64 
                        });

                    } catch (error) {
                        console.error("Error generating AI response:", error);
                        safeSend(ws, { type: 'error_processing' });
                    }
                    // 🔥 FIN DE CAMBIO 🔥
                } catch (err) {
                    console.error("Error general en procesamiento post-transcripción:", err);
                }
            }
        } catch (globalErr) {
            console.error("Error global atrapado en el mensaje WS:", globalErr);
        }
    });
});