import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 CLAVE MAESTRA
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V84: VERSIÓN FINAL LIMPIA (SIN CÁMARA)`);

// 🛑 1. LISTA NEGRA (Anti-Alucinación)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "The following is a conversation"
];

// 💓 2. HEARTBEAT (Mantiene la conexión viva)
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// 🧠 3. FUNCIÓN DE LIMPIEZA DE IDIOMAS (Vital para el Chat)
function cleanLang(val) {
    if (!val) return "English";
    const l = val.toLowerCase();
    if (l.includes('ruso') || l.includes('russian')) return 'Russian';
    if (l.includes('español') || l.includes('spanish')) return 'Spanish';
    if (l.includes('inglés') || l.includes('english')) return 'English';
    if (l.includes('francés') || l.includes('french')) return 'French';
    if (l.includes('portugués') || l.includes('portuguese')) return 'Portuguese';
    if (l.includes('alemán') || l.includes('german')) return 'German';
    if (l.includes('italiano') || l.includes('italian')) return 'Italian';
    if (l.includes('chino') || l.includes('chinese')) return 'Chinese';
    if (l.includes('japonés') || l.includes('japanese')) return 'Japanese';
    return val.replace(/[^a-zA-Z]/g, '').trim() || "English";
}

// ⚡ LÓGICA DE CONEXIÓN
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.isAuthenticated = false; 
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        if (message.length > 10 * 1024 * 1024) return; // Bloqueo de 10MB

        try {
            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // 4. AUTENTICACIÓN
            if (data.type === 'auth') {
                if (data.token === APP_INTERNAL_KEY) {
                    ws.isAuthenticated = true;
                    return ws.send(JSON.stringify({ type: 'auth_success' }));
                } else { return ws.close(); }
            }
            if (!ws.isAuthenticated) return;
            if (data.type === 'start_realtime_session') return;

            // =================================================================
            // 🎙️ MODO AUDIO (LIVE) - ESTRUCTURA V75 ORIGINAL
            // =================================================================
            if (data.type === 'audio_input') {
                // Variables DENTRO (Seguro)
                const rawLangA = cleanLang(data.langSource || "Spanish");
                const rawLangB = cleanLang(data.langTarget || "English");
                
                // Fix de Voz
                let voiceInput = (data.voice || "alloy").toLowerCase().trim();
                const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
                const liveVoice = validVoices.includes(voiceInput) ? voiceInput : "alloy";

                console.log(`🎙️ LIVE: ${rawLangA} <-> ${rawLangB} | Voz: ${liveVoice}`);

                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // A. Transcribir
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: `Conversation in ${rawLangA} and ${rawLangB}.`, 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // B. Filtros (Silencio / Alucinación / Eco)
                    if (/(.)\1{4,}/.test(userText)) return; 
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) return;
                    
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) return; // Si se repite mucho, ignoramos
                    }

                    // C. Traducir
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `You are a STRICT INTERPRETER. Translate from ${rawLangA} to ${rawLangB}. If already ${rawLangB}, translate to ${rawLangA}. Output ONLY translation.` }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 250
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;

                    // D. Hablar
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: liveVoice, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // 🔥 ENVÍO RÁPIDO (AUDIO STREAM)
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    
                    // ENVÍO COMPLETO (Para Historial)
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: bufferTTS.toString('base64') }));

                } catch (error) { console.error("Error Live:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (CHAT) - EL ÚNICO LUGAR QUE FALLABA EN V75
            // =================================================================
            else if (data.type === 'text_input') {
                // AHORA SÍ detectamos el idioma aquí
                const rawLangA = cleanLang(data.langSource || "Spanish");
                const rawLangB = cleanLang(data.langTarget || "English");

                // Fix de Voz
                let voiceInput = (data.voice || "alloy").toLowerCase().trim();
                const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
                const chatVoice = validVoices.includes(voiceInput) ? voiceInput : "alloy";

                console.log(`📝 CHAT: ${rawLangA} <-> ${rawLangB} | Voz: ${chatVoice}`);

                const cleanText = data.text.substring(0, 500);
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                // Prompt EXPLÍCITO con idiomas (Soluciona el bug del inglés)
                                content: `Translate from ${rawLangA} to ${rawLangB}. If already ${rawLangB}, translate to ${rawLangA}. Tone: ${data.tone || "Neutral"}. Output ONLY translation.` 
                            }, 
                            { role: "user", content: cleanText }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: chatVoice, 
                        input: aiText, 
                        response_format: 'aac' 
                    });
                    
                    // Chat envía Texto + Audio
                    ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));
                } catch(e) { ws.send(JSON.stringify({ type: 'error' })); }
            }

            // (Sección de Cámara ELIMINADA como pediste)

        } catch (e) { console.error("WS Error:", e.message); }
    });
});