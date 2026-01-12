import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { Readable } from 'stream';

dotenv.config();

// Configuración de FFMPEG para el Modo Ferrari
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR TODO-EN-UNO v10.0: Listo en puerto ${PORT}`);

// Carpeta temporal para el Modo Clásico (Whisper)
const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Diccionario de Idiomas para Whisper
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar'
};

// ==========================================
// 🚦 ENRUTADOR PRINCIPAL
// ==========================================
wss.on('connection', (ws, req) => {
    const url = req.url || "/";
    console.log(`⚡ Cliente conectado en ruta: ${url}`);

    if (url.includes('/live')) {
        // Si la App entra a /live -> Usamos el motor Ferrari (0.3s)
        handleRealtimeSession(ws);
    } else {
        // Si entra normal -> Usamos el motor Clásico (Barato y Seguro)
        handleClassicSession(ws);
    }
});

// ==========================================
// 🏎️ MODO FERRARI (Realtime API 0.3s)
// ==========================================
function handleRealtimeSession(clientWs) {
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    let config = { my_lang: 'Español', target_lang: 'Inglés' };

    openAiWs.on('open', () => {
        console.log('✅ LIVE: Conectado a OpenAI');
        const sessionUpdate = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: `Eres un intérprete simultáneo de élite.
                Traduce del ${config.my_lang} al ${config.target_lang} y viceversa.
                NO respondas, SOLO traduce. Mantén el tono.`,
                voice: "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: null 
            }
        };
        openAiWs.send(JSON.stringify(sessionUpdate));
    });

    clientWs.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'config') config = data;
            else if (data.type === 'audio_append') {
                const inputBuffer = Buffer.from(data.audio, 'base64');
                convertAndSend(inputBuffer, openAiWs);
            }
        } catch (e) { console.error("Error Live:", e.message); }
    });

    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            if (response.type === 'response.audio.delta') {
                const pcmBuffer = Buffer.from(response.delta, 'base64');
                const wavBuffer = toWav(pcmBuffer); 
                clientWs.send(JSON.stringify({ type: 'audio_delta', payload: wavBuffer.toString('base64') }));
            }
        } catch (e) {}
    });

    clientWs.on('close', () => openAiWs.close());
    openAiWs.on('close', () => clientWs.close());
}

// ==========================================
// 📜 MODO CLÁSICO (Texto Barato, Fotos, Whisper)
// ==========================================
function handleClassicSession(ws) {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral"; 
            
            // 1. TEXTO (Usamos GPT-4o-mini para ahorrar dinero) 💰
            if (data.type === 'text_input') {
                console.log(`📝 Texto recibido: "${data.text}"`);
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "gpt-4o-mini");
            }

            // 2. AUDIO CLÁSICO (Whisper - Más compatible) 🎤
            else if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
                const langCode = ISO_LANGS[(data.my_lang || "").split(' ')[0]] || 'es';

                // Whisper es barato y muy preciso
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    language: langCode 
                });

                fs.unlinkSync(inputPath);
                
                if (transcription.text) {
                    console.log(`👂 Whisper oyó: "${transcription.text}"`);
                    // Aquí usamos GPT-4o normal para mejor calidad en traducción de voz
                    await processGPT(ws, transcription.text, data.my_lang, data.language, tone, data.voice, "gpt-4o");
                }
            }

            // 3. FOTOS (GPT-4o Vision) 📸
            else if (data.type === 'image_input') {
                console.log("📸 Procesando Imagen...");
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Si no hay texto, describe qué ves. Tono: ${tone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                // Enviamos respuesta con TTS
                sendResponse(ws, "📸 Imagen Analizada", response.choices[0].message.content, tone, data.voice);
            }

        } catch (error) { console.error("Error Clásico:", error.message); }
    });
}

// --- Funciones Auxiliares Clásicas ---

async function processGPT(ws, text, src, tgt, tone, voice, model) {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Eres un traductor experto. Traduce del ${src} al ${tgt}. Tono: ${tone}. Solo dame la traducción.` }, 
                { role: "user", content: text }
            ],
            model: model, 
            max_tokens: 250
        });
        const aiText = completion.choices[0].message.content;
        sendResponse(ws, text, aiText, tone, voice);
    } catch (e) { console.error(e); }
}

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    try {
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: voice, input: aiText, speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: buffer.toString('base64') 
        }));
    } catch (e) { console.error("Error TTS:", e.message); }
}

// --- Herramientas de Conversión para LIVE (FFMPEG) ---

function convertAndSend(inputBuffer, openAiWs) {
    const inputStream = new Readable();
    inputStream.push(inputBuffer);
    inputStream.push(null);

    ffmpeg(inputStream)
        .inputFormat('m4a') 
        .audioFrequency(24000) 
        .audioChannels(1)
        .format('s16le') 
        .on('error', (err) => console.error('Error FFMPEG:', err))
        .pipe() 
        .on('data', (chunk) => {
            if(openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: chunk.toString('base64')
                }));
            }
        })
        .on('end', () => {
            if(openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({type: "input_audio_buffer.commit"}));
                openAiWs.send(JSON.stringify({type: "response.create"}));
            }
        });
}

function toWav(pcmData) {
    const numChannels = 1;
    const sampleRate = 24000;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);
    
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); 
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    
    pcmData.copy(buffer, 44);
    return buffer;
}