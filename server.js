import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { Readable } from 'stream';

dotenv.config();

ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR "FERRARI" v11.0 (INTELLIGENT): Listo en puerto ${PORT}`);

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
        handleRealtimeSession(ws);
    } else {
        handleClassicSession(ws);
    }
});

// ==========================================
// 🏎️ MODO LIVE (0.3s)
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
        const sessionUpdate = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: `Eres un intérprete profesional de alto nivel.
                Tu trabajo es traducir EXACTAMENTE lo que dice el usuario del ${config.my_lang} al ${config.target_lang} y viceversa.
                REGLAS ESTRICTAS:
                1. NO respondas preguntas. SOLO TRADUCE.
                2. Si el usuario dice "Hola", traduce "Hello". NO digas "Hola, ¿cómo estás?".
                3. Mantén el tono, la emoción y la formalidad.
                4. Sé conciso.`,
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
        } catch (e) {}
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
// 📜 MODO CLÁSICO (Ahora usa GPT-4o SIEMPRE)
// ==========================================
function handleClassicSession(ws) {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral"; 
            
            // 1. TEXTO (Cambiado a GPT-4o para que no sea tonto)
            if (data.type === 'text_input') {
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "gpt-4o");
            }

            // 2. AUDIO CLÁSICO
            else if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
                
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    language: ISO_LANGS[(data.my_lang || "").split(' ')[0]]
                });
                fs.unlinkSync(inputPath);
                
                if (transcription.text) {
                    // Usamos GPT-4o para la traducción
                    await processGPT(ws, transcription.text, data.my_lang, data.language, tone, data.voice, "gpt-4o");
                }
            }

            // 3. FOTOS
            else if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Eres un traductor. Traduce TODO el texto que veas en la imagen al ${data.my_lang}. Si no hay texto, describe lo que ves brevemente.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                sendResponse(ws, "📸 Imagen", response.choices[0].message.content, tone, data.voice);
            }

        } catch (error) { console.error("Error Clásico:", error.message); }
    });
}

async function processGPT(ws, text, src, tgt, tone, voice, model) {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                // 🧠 INSTRUCCIÓN MAESTRA PARA QUE NO SEA TONTO
                { role: "system", content: `Actúa como un traductor profesional e intérprete.
                Traduce el siguiente texto del ${src} al ${tgt}.
                REGLAS:
                1. SOLO dame la traducción. NO respondas a la pregunta. NO des explicaciones.
                2. Si el texto es "Hola", traduce "Hello".
                3. Tono: ${tone}.` }, 
                { role: "user", content: text }
            ],
            model: model, 
            max_tokens: 300
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

function convertAndSend(inputBuffer, openAiWs) {
    const inputStream = new Readable();
    inputStream.push(inputBuffer);
    inputStream.push(null);
    ffmpeg(inputStream).inputFormat('m4a').audioFrequency(24000).audioChannels(1).format('s16le')
        .pipe().on('data', (chunk) => {
            if(openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: chunk.toString('base64') }));
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
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(24000, 24);
    buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40); pcmData.copy(buffer, 44);
    return buffer;
}