import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V79: COMPLETO (Heartbeat + Filtros + Fix Chat)`);

// 🛑 1. FILTROS ANTI-ALUCINACIÓN (Recuperados)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved"
];

// 💓 2. HEARTBEAT (Recuperado - Vital para Render)
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// 🧠 3. CEREBRO POLÍGLOTA
function detectLanguage(rawLang) {
    if (!rawLang) return "English";
    const l = rawLang.toLowerCase();
    if (l.includes('ruso') || l.includes('russian')) return 'Russian';
    if (l.includes('español') || l.includes('spanish')) return 'Spanish';
    if (l.includes('inglés') || l.includes('english')) return 'English';
    if (l.includes('francés') || l.includes('french')) return 'French';
    if (l.includes('japonés') || l.includes('japanese')) return 'Japanese';
    if (l.includes('alemán') || l.includes('german')) return 'German';
    if (l.includes('italiano') || l.includes('italian')) return 'Italian';
    if (l.includes('portugués') || l.includes('portuguese')) return 'Portuguese';
    if (l.includes('chino') || l.includes('chinese')) return 'Chinese';
    // Limpieza general
    return rawLang.replace(/[^a-zA-Z]/g, '').trim() || "English";
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.lastAiResponse = ""; // Para evitar ecos

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        // Protección Anti-DDoS
        if (message.length > 10 * 1024 * 1024) return;

        try {
            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // AUTH
            if (data.type === 'auth') {
                if (data.token === APP_INTERNAL_KEY) {
                    ws.isAuthenticated = true;
                    return ws.send(JSON.stringify({ type: 'auth_success' }));
                } else { return ws.close(); }
            }
            if (!ws.isAuthenticated) return;
            if (data.type === 'start_realtime_session') return;

            // 🔥🔥 VARIABLES GLOBALES (EL FIX) 🔥🔥
            // Las definimos AQUÍ para que sirvan tanto para Audio como para Texto
            
            // 1. VOZ: Forzamos minúscula y validamos
            let voiceInput = (data.voice || "alloy").toLowerCase().trim();
            const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
            const GLOBAL_VOICE = validVoices.includes(voiceInput) ? voiceInput : "alloy";

            // 2. IDIOMAS: Los detectamos antes de saber el modo
            const GLOBAL_SOURCE = detectLanguage(data.langSource || "Spanish");
            const GLOBAL_TARGET = detectLanguage(data.langTarget || "English");

            console.log(`🗣️ ${data.type} | Voz: ${GLOBAL_VOICE} | ${GLOBAL_SOURCE} -> ${GLOBAL_TARGET}`);

            // ==========================================
            // 🎙️ MODO AUDIO (LIVE)
            // ==========================================
            if (data.type === 'audio_input') {
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                // A. Transcribir
                const transcription = await openai.audio.transcriptions.create({ 
                    file: await toFile(audioBuffer, 'speech.m4a'), 
                    model: "whisper-1",
                    prompt: `Conversation in ${GLOBAL_SOURCE} and ${GLOBAL_TARGET}.`, 
                    temperature: 0 
                });
                
                const userText = transcription.text.trim();
                
                // B. Filtros de Silencio/Alucinación
                if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                // C. Traducir
                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: `Translate from ${GLOBAL_SOURCE} to ${GLOBAL_TARGET}. If already ${GLOBAL_TARGET}, translate to ${GLOBAL_SOURCE}. Output ONLY translation.` }, 
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o",
                });
                const aiText = completion.choices[0].message.content;
                ws.lastAiResponse = aiText;

                // D. Hablar (TTS) usando GLOBAL_VOICE
                const mp3 = await openai.audio.speech.create({ 
                    model: "tts-1", 
                    voice: GLOBAL_VOICE, 
                    input: aiText, 
                    response_format: "aac"
                });

                ws.send(JSON.stringify({ 
                    type: 'full_response', 
                    user_text: userText, 
                    ai_text: aiText, 
                    audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') 
                }));
            }

            // ==========================================
            // 📝 MODO TEXTO (CHAT) - CORREGIDO
            // ==========================================
            else if (data.type === 'text_input') {
                // Ahora usamos las variables GLOBAL_SOURCE y GLOBAL_TARGET
                const cleanText = data.text.substring(0, 500);

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: `Translate from ${GLOBAL_SOURCE} to ${GLOBAL_TARGET}. If already ${GLOBAL_TARGET}, translate to ${GLOBAL_SOURCE}. Output ONLY translation.` }, 
                        { role: "user", content: cleanText }
                    ],
                    model: "gpt-4o-mini"
                });
                const aiText = completion.choices[0].message.content;
                ws.lastAiResponse = aiText;

                // Usamos GLOBAL_VOICE
                const mp3 = await openai.audio.speech.create({ 
                    model: "tts-1", 
                    voice: GLOBAL_VOICE, 
                    input: aiText, 
                    response_format: 'aac' 
                });

                ws.send(JSON.stringify({ 
                    type: 'full_response', 
                    user_text: cleanText, 
                    ai_text: aiText, 
                    audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') 
                }));
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});