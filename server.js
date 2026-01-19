import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 TU CONTRASEÑA MAESTRA
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V80: VARIABLES GLOBALES (CORREGIDO)`);

// 🛑 LISTA NEGRA (Anti-Alucinación)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved",
    "DimaTorzok", "ZHUKOV", "Transcribe exactly"
];

// 💓 HEARTBEAT
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// 🧠 1. FUNCIÓN MAESTRA DE IDIOMAS (Limpia Emojis y Nombres)
function detectLanguage(rawLang) {
    if (!rawLang) return "English";
    const l = rawLang.toLowerCase();
    
    // Mapeo manual para asegurar precisión
    if (l.includes('ruso') || l.includes('russian')) return 'Russian';
    if (l.includes('español') || l.includes('spanish')) return 'Spanish';
    if (l.includes('inglés') || l.includes('english')) return 'English';
    if (l.includes('francés') || l.includes('french')) return 'French';
    if (l.includes('alemán') || l.includes('german')) return 'German';
    if (l.includes('italiano') || l.includes('italian')) return 'Italian';
    if (l.includes('portugués') || l.includes('portuguese')) return 'Portuguese';
    if (l.includes('chino') || l.includes('chinese')) return 'Chinese';
    if (l.includes('japonés') || l.includes('japanese')) return 'Japanese';

    // Limpieza general para otros idiomas
    return rawLang.replace(/[^a-zA-Z]/g, '').trim() || "English";
}

// ⚡ LÓGICA DE CONEXIÓN
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        // Protección de tamaño
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


            // 🔥🔥🔥 EL ARREGLO ESTÁ AQUÍ 🔥🔥🔥
            // Sacamos las variables afuera de los IFs para que sean GLOBALES
            
            // 1. VOZ GLOBAL (Corregimos mayúsculas aquí)
            let voiceInput = (data.voice || "alloy").toLowerCase().trim();
            const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
            const GLOBAL_VOICE = validVoices.includes(voiceInput) ? voiceInput : "alloy";

            // 2. IDIOMAS GLOBALES (Usamos el detector para limpiar "Ruso 🇷🇺")
            const GLOBAL_SOURCE = detectLanguage(data.langSource || "Spanish");
            const GLOBAL_TARGET = detectLanguage(data.langTarget || "English");

            console.log(`🗣️ ${data.type} | Voz: ${GLOBAL_VOICE} | ${GLOBAL_SOURCE} -> ${GLOBAL_TARGET}`);


            // =================================================================
            // 🎙️ MODO AUDIO (LIVE)
            // =================================================================
            if (data.type === 'audio_input') {
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // A. Transcribir
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: `Conversation in ${GLOBAL_SOURCE} and ${GLOBAL_TARGET}.`, 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                    // B. Traducir (Usando GLOBAL variables)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are an interpreter. Translate from ${GLOBAL_SOURCE} to ${GLOBAL_TARGET}. If already ${GLOBAL_TARGET}, translate to ${GLOBAL_SOURCE}. Output ONLY translation.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;

                    // C. Voz (Usando GLOBAL_VOICE)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: GLOBAL_VOICE, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: Buffer.from(await mp3Response.arrayBuffer()).toString('base64') }));

                } catch (error) { console.error(error); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (CHAT CLÁSICO) - ¡AHORA SÍ FUNCIONA!
            // =================================================================
            else if (data.type === 'text_input') {
                const cleanText = data.text.substring(0, 500);
                
                try {
                    // AHORA SÍ LE PASAMOS LOS IDIOMAS
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                // AQUÍ ESTABA EL FALLO: Antes solo pasabas "tone". Ahora pasamos la orden completa.
                                content: `Translate from ${GLOBAL_SOURCE} to ${GLOBAL_TARGET}. If already ${GLOBAL_TARGET}, translate to ${GLOBAL_SOURCE}. Tone: ${data.tone || "Neutral"}. Output ONLY translation.` 
                            }, 
                            { role: "user", content: cleanText }
                        ],
                        model: "gpt-4o-mini"
                    });

                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    // AHORA SÍ USAMOS LA VOZ CORRECTA
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: GLOBAL_VOICE, 
                        input: aiText, 
                        response_format: 'aac' 
                    });
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));
                } catch(e) { ws.send(JSON.stringify({ type: 'error' })); }
            }

        } catch (e) { console.error("WS Error Crítico:", e.message); }
    });
});