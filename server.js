import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR REALTIME PURO v6.0: Listo en puerto ${PORT}`);

// Configuración Clásica (Para fotos y chat normal)
const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar'
};

wss.on('connection', (ws, req) => {
    const url = req.url || "/";
    
    if (url.includes('/live')) {
        console.log('⚡ Conexión REALTIME iniciada');
        handleRealtimeSession(ws);
    } else {
        console.log('📝 Conexión CLÁSICA iniciada');
        handleClassicSession(ws);
    }
});

// ==========================================
// 🧠 MODO REALTIME (0.3s LATENCIA)
// ==========================================
function handleRealtimeSession(clientWs) {
    // Conectamos directo al cerebro rápido de OpenAI
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    let isSessionActive = false;

    openAiWs.on('open', () => {
        console.log('✅ OpenAI Conectado');
        isSessionActive = true;
    });

    // MENSAJES: APP -> SERVIDOR -> OPENAI
    clientWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            if (!isSessionActive) return;

            // 1. Configuración Inicial
            if (msg.type === 'config') {
                console.log(`⚙️ Configurando: ${msg.my_lang} <-> ${msg.target_lang}`);
                const sessionConfig = {
                    type: "session.update",
                    session: {
                        modalities: ["text", "audio"],
                        instructions: `Eres un intérprete simultáneo de élite. 
                        Traduce bidireccionalmente entre ${msg.my_lang} y ${msg.target_lang}.
                        IMPORTANTE:
                        1. NO respondas a lo que dice el usuario, SOLO TRADUCE.
                        2. Mantén el tono exacto (si está enojado, suena enojado).
                        3. Sé extremadamente rápido.`,
                        voice: "alloy",
                        input_audio_format: "pcm16", // Formato crudo
                        output_audio_format: "pcm16",
                        turn_detection: {
                            type: "server_vad", // OpenAI detecta cuándo callarse
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 500
                        }
                    }
                };
                openAiWs.send(JSON.stringify(sessionConfig));
            }
            // 2. Flujo de Audio (Streaming)
            else if (msg.type === 'audio_stream') {
                openAiWs.send(JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: msg.payload
                }));
            }
        } catch (e) {
            console.error("Error procesando mensaje cliente:", e.message);
        }
    });

    // MENSAJES: OPENAI -> SERVIDOR -> APP
    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            
            // Audio de respuesta (Traducción)
            if (response.type === 'response.audio.delta') {
                clientWs.send(JSON.stringify({
                    type: 'audio_delta',
                    payload: response.delta
                }));
            }
            
            // Eventos de "empezó a hablar" (para animaciones)
            if (response.type === 'response.audio.done') {
                clientWs.send(JSON.stringify({ type: 'ai_stop_talking' }));
            }
        } catch (e) {}
    });

    // Cierres
    clientWs.on('close', () => openAiWs.close());
    openAiWs.on('close', () => clientWs.close());
    openAiWs.on('error', (e) => console.error("Error OpenAI:", e.message));
}

// ==========================================
// 📜 MODO CLÁSICO (Backup Robusto)
// ==========================================
function handleClassicSession(ws) {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral"; 
            
            if (data.type === 'text_input') {
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "gpt-4o-mini");
            }

            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
                const langCode = ISO_LANGS[(data.my_lang || "").split(' ')[0]] || 'es';

                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    language: langCode 
                });

                fs.unlinkSync(inputPath);
                if (transcription.text) await processGPT(ws, transcription.text, data.my_lang, data.language, tone, data.voice, "gpt-4o");
            }
            // (Imagen omitido por brevedad, usar el anterior si se necesita)
        } catch (error) { console.error("Error Clásico:", error.message); }
    });
}

async function processGPT(ws, text, src, tgt, tone, voice, model) {
    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: `Traduce del ${src} al ${tgt}. Tono: ${tone}. Solo la traducción.` }, { role: "user", content: text }],
            model: model, max_tokens: 200
        });
        const aiText = completion.choices[0].message.content;
        const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: voice, input: aiText, speed: 1.1 });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        ws.send(JSON.stringify({ type: 'full_response', user_text: text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
    } catch (e) { console.error(e); }
}