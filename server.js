import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 CLAVE MAESTRA
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V81: MOTORES SEPARADOS (ESTABILIDAD TOTAL)`);

// 🛑 ANTI-ALUCINACIÓN
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved"
];

// 💓 HEARTBEAT (Para que no se desconecte)
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// 🧠 FUNCIÓN DE AYUDA: LIMPIAR IDIOMA
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

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
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


            // =================================================================
            // 🎙️ MODO AUDIO (LIVE) - VOLVEMOS A LA LÓGICA QUE FUNCIONABA
            // =================================================================
            if (data.type === 'audio_input') {
                // Definimos variables AQUÍ ADENTRO (Seguro)
                const rawLangA = cleanLang(data.langSource || "Spanish");
                const rawLangB = cleanLang(data.langTarget || "English");
                
                // Fix de Voz local
                let voiceInput = (data.voice || "alloy").toLowerCase().trim();
                const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
                const liveVoice = validVoices.includes(voiceInput) ? voiceInput : "alloy";

                console.log(`🎙️ LIVE: ${rawLangA} -> ${rawLangB} | Voz: ${liveVoice}`);

                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. Transcribir
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: `Conversation in ${rawLangA} and ${rawLangB}.`, 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                    // 2. Traducir
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `Translate from ${rawLangA} to ${rawLangB}. If already ${rawLangB}, translate to ${rawLangA}. Output ONLY translation.` }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;

                    // 3. Hablar
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: liveVoice, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));

                } catch (error) { console.error("Error Live:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (CHAT) - CORREGIDO E INDEPENDIENTE
            // =================================================================
            else if (data.type === 'text_input') {
                // AQUÍ ESTABA EL ERROR: Antes no leíamos los idiomas. AHORA SÍ.
                const rawLangA = cleanLang(data.langSource || "Spanish"); // <--- AHORA EL CHAT VE EL IDIOMA
                const rawLangB = cleanLang(data.langTarget || "English"); // <--- AHORA EL CHAT VE EL IDIOMA

                // Fix de Voz local
                let voiceInput = (data.voice || "alloy").toLowerCase().trim();
                const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
                const chatVoice = validVoices.includes(voiceInput) ? voiceInput : "alloy";

                console.log(`📝 CHAT: ${rawLangA} -> ${rawLangB} | Voz: ${chatVoice}`);

                const cleanText = data.text.substring(0, 500);
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                // Usamos los idiomas explícitos
                                content: `Translate from ${rawLangA} to ${rawLangB}. If already ${rawLangB}, translate to ${rawLangA}. Output ONLY translation.` 
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
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));
                } catch(e) { ws.send(JSON.stringify({ type: 'error' })); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});