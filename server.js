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
import https from 'https'; 
// FINAL DE IMPORTACIONES //

// =================================================================
// 🚨 CAZADORES DE ERRORES GLOBALES PARA LA TERMINAL DE RENDER 🚨
// =================================================================
process.on('uncaughtException', (err) => {
    console.error("🚨 [ERROR CRITICO NO ATRAPADO]:", err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error("🚨 [PROMESA RECHAZADA NO MANEJADA]:", reason);
});

// INICIO DE CONFIGURACIÓN INICIAL //
dotenv.config();
const PORT = process.env.PORT || 8080;
// FINAL DE CONFIGURACIÓN INICIAL //

// 🔥 EL PARCHE "ANTI PREMATURE CLOSE" 🔥
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 15000,
    timeout: 30000,
});

// 🔥 CONFIGURACIÓN FIREBASE ADMIN 🔥
if (!admin.apps.length) {
    try {
        const envVar = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (!envVar) {
            console.error("❌ ALERTA CRITICA: La variable FIREBASE_SERVICE_ACCOUNT no existe o esta vacia.");
        } else {
            const serviceAccount = JSON.parse(envVar);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: "https://alteregodb-1b8f3-default-rtdb.firebaseio.com"
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
    res.status(200).send("Servidor AlterEgo Activo 🚀\n");
});

// =================================================================
// 💰 WEBHOOK DE REVENUECAT
// =================================================================
app.post('/webhook-revenuecat', async (req, res) => {
    const expectedToken = process.env.RC_WEBHOOK_AUTH || "AlterEgo_Secreto_Webhook_2026";
    if (req.headers.authorization !== expectedToken) {
        console.warn("🚨 [SEGURIDAD] Intento de acceso no autorizado al Webhook.");
        return res.status(401).send("No autorizado");
    }

    res.status(200).send("Webhook recibido");
    
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
            console.log(`👻 [Webhook] Ignorando evento de usuario anonimo en Sandbox: ${userId}`);
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
             console.log(`❌ [RevenueCat] ${safeUserId} perdio el PRO (Expiracion).`);
        }
        else if (eventType === "CANCELLATION") {
             if (event.cancel_reason === "CUSTOMER_SUPPORT" || 
                 event.cancel_reason === "BILLING_ERROR" || 
                 event.cancel_reason === "FRAUD" || 
                 event.cancel_reason === "DEVELOPER_INITIATED") { 
                 
                 const productId = event.product_id || "";
                 
                 const defaultCredits = {
                     'starter_10_pack': 25,
                     'basic_30_pack': 180,
                     'pro_60_pack': 450,
                     'ultra_120_pack': 1000
                 };

                 if (defaultCredits[productId] !== undefined) {
                     let realCredits = defaultCredits[productId];
                     try {
                         const res = await fetch("https://alteregodb-1b8f3-default-rtdb.firebaseio.com/dynamic_config/packages.json");
                         const firebaseData = await res.json();
                         if (firebaseData && firebaseData[productId] && firebaseData[productId].credits) {
                             realCredits = firebaseData[productId].credits;
                         }
                     } catch (err) {
                         console.error("🚨 [Webhook] Error leyendo dynamic_config, usando default:", err);
                     }

                     const unitsToRevoke = realCredits * 60;
                     const snapshot = await userRef.once('value');
                     const userData = snapshot.val() || {};
                     let currentCredits = parseFloat(userData.credits) || 0;
                     let newBalance = currentCredits - unitsToRevoke;
                     
                     await userRef.update({ credits: newBalance });
                     console.log(`🚨 [RevenueCat] REEMBOLSO: Se quitaron ${unitsToRevoke} unidades (${realCredits} creditos) a ${safeUserId}. Saldo actual: ${newBalance}`);
                 } else {
                     await userRef.update({ isPro: false, pro_updated_at: Date.now() }); 
                     console.log(`❌ [RevenueCat] VIP revocado a ${safeUserId} (Motivo: ${event.cancel_reason}).`);
                 }
             } else {
                 console.log(`ℹ️ [RevenueCat] ${safeUserId} apago la auto-renovacion.`);
             }
        }

    } catch (error) {
        console.error("🚨 [ERROR EN WEBHOOK]:", error);
    }
});

app.use((err, req, res, next) => {
    console.error("🚨 [ERROR DE EXPRESS]:", err.stack);
    res.status(500).send("Error interno del servidor.");
});

// INICIO DE INICIALIZACIÓN DE SERVIDOR Y APIS //
const server = app.listen(PORT, () => {
    console.log(`🏆 SERVIDOR V170: Puerto: ${PORT}`);
});

const wss = new WebSocketServer({ server });

const RENDER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; 
setInterval(() => {
    fetch(RENDER_URL, { agent: keepAliveAgent }).catch(() => {});
}, 600000);

// 🔥 Inyectamos el agente en las librerías oficiales 🔥
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, httpAgent: keepAliveAgent });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, httpAgent: keepAliveAgent });

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = "https://alteregodb-1b8f3-default-rtdb.firebaseio.com"; 
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
    { code: 'ar', name: 'Árabe', serverName: 'Arabic' }
];

const WHISPER_LANGUAGES = ['pt-BR', 'zh-CN', 'ar', 'pt-PT', 'eu', 'gl'];

const WHISPER_HALLUCINATIONS = [
    "subtítulos", "subtitulos", "amara.org", "gracias por ver", "thanks for watching", 
    "suscríbete", "subscribe", "♪", "🎵", "🎶", "[música]", "(música)", "[music]", "(music)",
    "[silencio]", "(silencio)", "traducido por", "translated by", "youtu.be", ".com", 
    "www.", "televisión española", "derechos de autor", "copyright", "subtítulos realizados",
    "subs by", "amara", "subs:", "subtítulos:", "si hay silencio", "devuelve un texto", "vacío"
];

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

    return codeA; 
}

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
                                    body: JSON.stringify({ text: textForAudioGreeting }),
                                    agent: keepAliveAgent
                                });
                                
                                if (dRes.ok) {
                                    const arrayBuffer = await dRes.arrayBuffer();
                                    base64Audio = Buffer.from(arrayBuffer).toString('base64');
                                    ttsSuccess = true;
                                }
                            } catch (e) {}
                        }

                        if (!ttsSuccess && (OPENAI_VOICES.includes(requestedVoice) || data.voice_engine === 'openai')) {
                            try {
                                const validVoice = OPENAI_VOICES.includes(requestedVoice) ? requestedVoice : 'nova';
                                const oRes = await fetch("https://api.openai.com/v1/audio/speech", {
                                    method: "POST",
                                    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                    body: JSON.stringify({ model: "tts-1", input: textForAudioGreeting, voice: validVoice }),
                                    agent: keepAliveAgent
                                });
                                
                                if (oRes.ok) {
                                    base64Audio = Buffer.from(await oRes.arrayBuffer()).toString('base64');
                                } 
                            } catch (e) {}
                        }
                        safeSend(ws, { type: 'full_response', user_text: null, ai_text: data.text, audio: base64Audio });
                    } catch (err) {}
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

            // 🎤 INICIO DE ENTRADA DE AUDIO (audio_input)
            if (data.type === 'audio_input' || data.type === 'free_audio_input') {
                try {
                    if (!data.payload) return;
                    if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                    const audioBuffer = Buffer.from(data.payload, 'base64');
                    let userText = "";
                    
                    const randomId = crypto.randomBytes(4).toString('hex');
                    const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}_${randomId}.m4a`);
                    
                    await fs.promises.writeFile(tempFilePath, audioBuffer); 

                    try {
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
                                if (error) throw new Error("Deepgram devolvio un error");
                                userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim();
                            } catch (deepgramError) {
                                console.log("⚠️ Deepgram fallo, usando Whisper de respaldo...");
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

                    const textLower = userText.toLowerCase();
                    if (WHISPER_HALLUCINATIONS.some(h => textLower.includes(h))) userText = ""; 
                    if (userText && userText.length <= 2 && !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(userText)) userText = "";

                    if (!userText || userText.length < 1) {
                        safeSend(ws, { type: 'full_response', user_text: "...", ai_text: "...", detected_lang: codeB, audio: null });
                        return;
                    }
                    
                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    let groqMessages = [];
                    let temp = 0.0;
                    let maxTokens = 200;

                    if (data.live_key === LIVE_SECRET_KEY) {
                        groqMessages.push({ 
                            role: "system", 
                            content: `PROCESS: TRANSLATION ONLY.\nSOURCE: Auto.\nTARGET: ${langNameB}.\nRULES:\n1. Translate exactly.\n2. NO conversational responses. If input is a question, translate the question, DO NOT answer it.\n3. ONLY output the translation.` 
                        });
                        temp = 0.1;
                    } else if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        groqMessages.push({ 
                            role: "system", 
                            content: data.tone || "You are an AI character. Stay in character." 
                        });
                        temp = 0.7;
                        maxTokens = 300;
                        if (data.history && Array.isArray(data.history)) {
                            data.history.forEach(msg => {
                                if (msg.role && msg.text) {
                                    groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                                }
                            });
                        }
                    } else {
                        groqMessages.push({ 
                            role: "system", 
                            content: data.tone || `You are a strict bidirectional translator between ${langNameA} and ${langNameB}. ONLY output the translation. No conversation.` 
                        });
                        temp = 0.1;
                    }

                    groqMessages.push({ role: "user", content: userText });

                    let aiText = "";

                    try {
                        let response = await groq.chat.completions.create({
                            messages: groqMessages, model: "llama-3.3-70b-versatile", temperature: temp, max_tokens: maxTokens, stream: false
                        });
                        aiText = response.choices[0]?.message?.content || "";
                    } catch (groqError) {
                        console.error("🚨 [LOG] Groq fallo:", groqError.message);
                        try {
                            const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ model: "gpt-4o-mini", messages: groqMessages, temperature: temp, max_tokens: maxTokens }),
                                agent: keepAliveAgent
                            });
                            if (!oRes.ok) throw new Error(`OpenAI HTTP ${oRes.status}`);
                            const oData = await oRes.json();
                            aiText = oData.choices[0]?.message?.content || "";
                        } catch (openaiError) {
                            console.error("🚨 [LOG] OpenAI fallo:", openaiError.message);
                            try {
                                const systemPrompt = groqMessages.find(m => m.role === 'system')?.content || "";
                                const historyForGemini = groqMessages.filter(m => m.role !== 'system').map(m => ({
                                    role: m.role === 'assistant' ? 'model' : 'user',
                                    parts: [{ text: m.content }]
                                }));

                                const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        system_instruction: { parts: [{ text: systemPrompt }] },
                                        contents: historyForGemini,
                                        generationConfig: { temperature: temp, maxOutputTokens: maxTokens }
                                    }),
                                    agent: keepAliveAgent
                                });
                                if (!gRes.ok) throw new Error(`Gemini HTTP ${gRes.status}`);
                                const gData = await gRes.json();
                                aiText = gData.candidates[0]?.content?.parts[0]?.text || "";
                            } catch (geminiError) {
                                console.error("🚨 [LOG] GEMINI tambien fallo:", geminiError.message);
                                aiText = "🚨 ERROR DE IA: Todos los motores de respaldo fallaron.";
                            }
                        }
                    }
                    
                    aiText = sanitizeAiResponse(aiText);
                    if (!aiText) { aiText = "..."; }

                    console.log(`🧠 [Respuesta IA]: "${aiText}"`);

                    let base64Audio = null;
                    const isFreeMode = data.type === 'free_audio_input'; 
                    let finalOutputLang = detectLanguageServer(aiText, codeA, codeB);
                    
                    if (!isFreeMode && (data.live_key === LIVE_SECRET_KEY || data.simulator_key === SIMULATOR_SECRET_KEY)) {
                        let activeVoice = finalOutputLang === codeA 
                            ? (data.myVoice || { provider: 'native', id: 'native' }) 
                            : (data.targetVoice || { provider: 'native', id: 'native' });

                        if (activeVoice.provider !== 'native' && activeVoice.provider !== 'free') {
                            try {
                                let textForAudio = aiText.replace(/\|\|\|/g, ' ').replace(/###/g, '').replace(/["']/g, '').trim();

                                if (activeVoice.provider === 'deepgram') {
                                    const tLang = finalOutputLang.substring(0, 2).toLowerCase();
                                    const isMale = (activeVoice.id === 'premium_male');
                                    
                                    let dVoice = "aura-asteria-en"; 
                                    if (tLang === 'en') dVoice = isMale ? "aura-orion-en" : "aura-asteria-en";
                                    else if (tLang === 'es') dVoice = isMale ? "aura-2-alvaro-es" : "aura-2-carina-es";
                                    else if (tLang === 'fr') dVoice = isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr"; 
                                    else if (tLang === 'de') dVoice = isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de"; 
                                    else if (tLang === 'it') dVoice = isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it"; 
                                    else if (tLang === 'nl') dVoice = "aura-2-beatrix-nl"; 
                                    else if (tLang === 'ja') dVoice = isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja"; 

                                    const dRes = await fetch(`https://api.deepgram.com/v1/speak?model=${dVoice}`, {
                                        method: "POST", headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: textForAudio }),
                                        agent: keepAliveAgent
                                    });
                                    if (dRes.ok) {
                                        base64Audio = Buffer.from(await dRes.arrayBuffer()).toString('base64');
                                    } else {
                                        const errDetail = await dRes.text();
                                        console.error("🚨 [LOG] Deepgram TTS error API:", errDetail);
                                    }
                                }
                            } catch (err) {
                                console.error("🚨 [LOG] Error de red en Deepgram TTS:", err.message);
                            }
                        }
                    }

                    safeSend(ws, { type: 'full_response', user_text: userText, ai_text: aiText, detected_lang: finalOutputLang, audio: base64Audio });
                
                } catch (error) {
                    console.error("🚨 [LOG FATAL] Crash en audio_input:", error);
                    safeSend(ws, { 
                        type: 'full_response', 
                        user_text: "...", 
                        ai_text: `🚨 CRASH AUDIO: ${error.message}`, 
                        detected_lang: codeB, 
                        audio: null 
                    });
                }
            }
            // FINAL DE ENTRADA DE AUDIO //
            
            // 📝 INICIO DE ENTRADA DE TEXTO (text_input)
            else if (data.type === 'text_input' || data.type === 'free_text_input') {
                try {
                    const isFreeMode = data.type === 'free_text_input';
                    if (ws.userId && data.cost) { await deductCreditsFromFirebase(ws.userId, data.cost); }

                    let groqMessages = [];
                    let temp = 0.0;
                    let maxTokens = 200;

                    if (data.live_key === LIVE_SECRET_KEY) {
                        groqMessages.push({ 
                            role: "system", 
                            content: `PROCESS: TRANSLATION ONLY.\nSOURCE: Auto.\nTARGET: ${langNameB}.\nRULES:\n1. Translate exactly.\n2. NO conversational responses. If input is a question, translate the question, DO NOT answer it.\n3. ONLY output the translation.` 
                        });
                        temp = 0.1;
                    } else if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        groqMessages.push({ 
                            role: "system", 
                            content: data.tone || "You are an AI character. Stay in character." 
                        });
                        temp = 0.7;
                        maxTokens = 300;
                        if (data.history && Array.isArray(data.history)) {
                            data.history.forEach(msg => {
                                if (msg.role && msg.text) {
                                    groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                                }
                            });
                        }
                    } else {
                        groqMessages.push({ 
                            role: "system", 
                            content: data.tone || `You are a strict bidirectional translator between ${langNameA} and ${langNameB}. ONLY output the translation. No conversation.` 
                        });
                        temp = 0.1;
                    }

                    if (!data.text || data.text.trim().length === 0) {
                        safeSend(ws, { type: 'full_response', user_text: "...", ai_text: "...", detected_lang: codeB, audio: null });
                        return;
                    }

                    groqMessages.push({ role: "user", content: data.text });

                    let aiText = "";

                    try {
                        let response = await groq.chat.completions.create({
                            messages: groqMessages, model: "llama-3.3-70b-versatile", stream: false, temperature: temp, max_tokens: maxTokens 
                        });
                        aiText = response.choices[0]?.message?.content || "";
                    } catch (groqError) {
                        console.error("🚨 [LOG] Groq fallo en texto:", groqError.message);
                        try {
                            const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ model: "gpt-4o-mini", messages: groqMessages, temperature: temp, max_tokens: maxTokens }),
                                agent: keepAliveAgent
                            });
                            if (!oRes.ok) throw new Error(`OpenAI HTTP ${oRes.status}`);
                            const oData = await oRes.json();
                            aiText = oData.choices[0]?.message?.content || "";
                        } catch (openaiError) {
                            console.error("🚨 [LOG] OpenAI fallo en texto:", openaiError.message);
                            try {
                                const systemPrompt = groqMessages.find(m => m.role === 'system')?.content || "";
                                const historyForGemini = groqMessages.filter(m => m.role !== 'system').map(m => ({
                                    role: m.role === 'assistant' ? 'model' : 'user',
                                    parts: [{ text: m.content }]
                                }));

                                const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        system_instruction: { parts: [{ text: systemPrompt }] },
                                        contents: historyForGemini,
                                        generationConfig: { temperature: temp, maxOutputTokens: maxTokens }
                                    }),
                                    agent: keepAliveAgent
                                });
                                if (!gRes.ok) throw new Error(`Gemini HTTP ${gRes.status}`);
                                const gData = await gRes.json();
                                aiText = gData.candidates[0]?.content?.parts[0]?.text || "";
                            } catch (geminiError) {
                                console.error("🚨 [LOG] GEMINI fallo en texto:", geminiError.message);
                                aiText = "🚨 ERROR DE IA: Todos los motores fallaron.";
                            }
                        }
                    }

                    aiText = sanitizeAiResponse(aiText);
                    if (!aiText) { aiText = "..."; }
                    
                    let base64Audio = null;
                    let finalOutputLang = detectLanguageServer(aiText, codeA, codeB);
                    
                    if (!isFreeMode && (data.live_key === LIVE_SECRET_KEY || data.simulator_key === SIMULATOR_SECRET_KEY)) {
                        let activeVoice = finalOutputLang === codeA 
                            ? (data.myVoice || { provider: 'native', id: 'native' }) 
                            : (data.targetVoice || { provider: 'native', id: 'native' });

                        if (activeVoice.provider !== 'native' && activeVoice.provider !== 'free') {
                            try {
                                let textForAudio = aiText.replace(/\|\|\|/g, ' ').replace(/###/g, '').replace(/["']/g, '').trim();

                                if (activeVoice.provider === 'deepgram') {
                                    const tLang = finalOutputLang.substring(0, 2).toLowerCase();
                                    const isMale = (activeVoice.id === 'premium_male');
                                    
                                    let dVoice = "aura-asteria-en"; 
                                    if (tLang === 'en') dVoice = isMale ? "aura-orion-en" : "aura-asteria-en";
                                    else if (tLang === 'es') dVoice = isMale ? "aura-2-alvaro-es" : "aura-2-carina-es";
                                    else if (tLang === 'fr') dVoice = isMale ? "aura-2-hector-fr" : "aura-2-agathe-fr"; 
                                    else if (tLang === 'de') dVoice = isMale ? "aura-2-fabian-de" : "aura-2-aurelia-de"; 
                                    else if (tLang === 'it') dVoice = isMale ? "aura-2-cesare-it" : "aura-2-cinzia-it"; 
                                    else if (tLang === 'nl') dVoice = "aura-2-beatrix-nl"; 
                                    else if (tLang === 'ja') dVoice = isMale ? "aura-2-ebisu-ja" : "aura-2-ama-ja"; 

                                    const dRes = await fetch(`https://api.deepgram.com/v1/speak?model=${dVoice}`, {
                                        method: "POST", headers: { "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: textForAudio }),
                                        agent: keepAliveAgent
                                    });
                                    if (dRes.ok) {
                                        base64Audio = Buffer.from(await dRes.arrayBuffer()).toString('base64');
                                    } else {
                                        const errDetail = await dRes.text();
                                        console.error("🚨 [LOG] Deepgram TTS error API en texto:", errDetail);
                                    }
                                }
                            } catch (err) {
                                console.error("🚨 [LOG] Error de red en Deepgram TTS en texto:", err.message);
                            }
                        }
                    }

                    safeSend(ws, { type: 'full_response', user_text: data.text, ai_text: aiText, detected_lang: finalOutputLang, audio: base64Audio });
                
                } catch (error) {
                    console.error("🚨 [LOG FATAL] Crash en text_input:", error);
                    safeSend(ws, { 
                        type: 'full_response', 
                        user_text: data.text || "...", 
                        ai_text: `🚨 CRASH TEXTO: ${error.message}`, 
                        detected_lang: codeB, 
                        audio: null 
                    });
                }
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

