const { WebSocketServer } = require('ws');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { toFile } = require('openai');
const stringSimilarity = require('string-similarity');
const admin = require('firebase-admin');

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 LLAVE MAESTRA (Debe coincidir con la App)
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`🚀 SERVIDOR V81 [LIGERO]: Sin Cámara, Historial Feed, Firebase. Puerto: ${PORT}`);

// ==========================================
// 🔥 1. CONEXIÓN A FIREBASE
// ==========================================
try {
    const serviceAccount = require('./firebase_key.json');
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://alteregodb-1b8f3-default-rtdb.firebaseio.com"
        });
    }
    console.log("🔥 Firebase: CONECTADO OK");
} catch (error) {
    console.error("❌ ERROR CRÍTICO: Falta 'firebase_key.json'", error.message);
}

const db = admin.database();

// 🛡️ LISTA NEGRA (Anti-Basura)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS"
];

// ==========================================
// 💰 GESTIÓN DE CRÉDITOS
// ==========================================

async function checkCredits(userId, minCost) {
    try {
        const ref = db.ref(`users/${userId}`);
        const snapshot = await ref.once('value');
        const userData = snapshot.val();
        
        if (!userData || userData.credits === undefined) return { ok: false, val: 0 };
        const current = parseFloat(userData.credits);
        return { ok: current >= minCost, val: current };
    } catch (e) {
        console.error("Error Check:", e.message);
        return { ok: false, val: 0 };
    }
}

async function deductCredits(userId, amount) {
    try {
        const ref = db.ref(`users/${userId}/credits`);
        await ref.transaction((current) => {
            return Math.max(0, (current || 0) - amount);
        });
        console.log(`💰 Cobrado: ${amount.toFixed(4)} a ${userId}`);
    } catch (e) {
        console.error("Error Deduct:", e.message);
    }
}

// 💓 HEARTBEAT
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ==========================================
// 🔌 WEBSOCKET PRINCIPAL
// ==========================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.userId = "UNKNOWN"; 
    ws.lastMessageTime = 0;
    ws.lastAiResponse = "";

    console.log(`⚡ Cliente: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            // Anti-DDoS
            const now = Date.now();
            if (now - ws.lastMessageTime < 150) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'ping') return;

            // 1. AUTENTICACIÓN
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    ws.close();
                    return;
                }
                ws.userId = data.user_id || "UNKNOWN";
                const status = await checkCredits(ws.userId, 0);
                ws.send(JSON.stringify({ type: 'auth_success', credits: status.val }));
                return;
            }

            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE) - 0.02 creds/seg
            // =================================================================
            if (data.type === 'audio_input') {
                const check = await checkCredits(ws.userId, 0.1);
                if (!check.ok) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Saldo insuficiente' }));
                    return;
                }

                if (!data.payload) return;
                const startTime = Date.now();
                
                const audioBuffer = Buffer.from(data.payload, 'base64');
                const rawLangA = data.langSource || "Spanish";
                const rawLangB = data.langTarget || "English";
                // Recibimos la instrucción estricta desde la App
                const instruction = data.tone || "Translate content.";

                try {
                    // A. WHISPER (Oído)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Conversation. Dialogue. Hola. Hello.", 
                        temperature: 0.2 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // FILTROS
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura: "${userText}"`); return; 
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ Live: "${userText}"`);

                    // B. GPT-4o (Cerebro)
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER.
                                CONTEXT: ${rawLangA} <-> ${rawLangB}.
                                RULES:
                                1. Auto-detect input language.
                                2. Translate to the OTHER language.
                                3. OUTPUT ONLY TRANSLATION. NO CHAT.
                                4. If noise/silence, output NOTHING.` 
                            }, 
                            { 
                                role: "system", 
                                content: instruction // Refuerzo de regla
                            },
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 300,
                        stream: true
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            // Enviamos letra por letra para que la app pinte rápido
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    
                    if (!aiText || aiText.trim().length === 0) return;
                    ws.lastAiResponse = aiText;

                    // C. TTS (Voz)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: targetVoice, input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // 🔥 AQUÍ MANDAMOS EL HISTORIAL A LA APP
                    // La app recibe esto, pinta tu mensaje y la respuesta, y lo guarda en su memoria.
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                    // D. COBRO DINÁMICO
                    const durationSeconds = (Date.now() - startTime) / 1000;
                    const cost = Math.max(0.04, durationSeconds * 0.02);
                    await deductCredits(ws.userId, cost);

                } catch (error) { console.error("❌ Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 TEXT INPUT (CHAT) - 0.1 creds (GPT-4o Mini)
            // =================================================================
            else if (data.type === 'text_input') {
                const check = await checkCredits(ws.userId, 0.1);
                if (!check.ok) return;

                const instruction = data.tone || "Translate.";
                try {
                    console.log(`📝 Texto: "${data.text}"`);
                    
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: "You are a TRANSLATION ENGINE. NO CHAT." },
                            { role: "system", content: instruction }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini", // Mini para ahorrar
                        stream: true
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    ws.lastAiResponse = aiText;
                    
                    // Audio opcional
                    let audioB64 = null;
                    if (aiText.trim()) {
                        const mp3 = await openai.audio.speech.create({ 
                            model: "tts-1", voice: targetVoice, input: aiText, response_format: 'aac' 
                        });
                        const buffer = Buffer.from(await mp3.arrayBuffer());
                        audioB64 = buffer.toString('base64');
                    }

                    // 🔥 MANDAMOS DATOS A LA APP PARA EL HISTORIAL
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio_payload: audioB64 
                    }));

                    await deductCredits(ws.userId, 0.1);

                } catch(e) { console.error("❌ Error Texto:", e.message); }
            }

        } catch (e) { console.error("🔥 Error WS:", e.message); }
    });
});