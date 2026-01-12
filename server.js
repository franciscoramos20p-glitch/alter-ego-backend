import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static'; // ✅ IMPORTACIÓN CORRECTA
import { Readable } from 'stream';

dotenv.config();

// ✅ CONFIGURACIÓN BLINDADA PARA RENDER
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO v15 (SIN ALUCINACIONES): Listo en puerto ${PORT}`);

// Carpeta temporal para audios clásicos
const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA: Si la IA intenta decir esto, LA CALLAMOS.
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "We listen to", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres"
];

const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar'
};

wss.on('connection', (ws, req) => {
    const url = req.url || "/";
    console.log(`⚡ Cliente conectado a: ${url}`);

    if (url.includes('/live')) {
        handleRealtimeSession(ws);
    } else {
        handleClassicSession(ws);
    }
});

// ==========================================
// 1. MODO LIVE (CON FILTRO DE SILENCIO)
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
        // INSTRUCCIÓN SUPREMA PARA QUE NO ALUCINE
        const sessionUpdate = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: `Eres AlterEgo, un traductor profesional.
                1. TU ÚNICA MISIÓN: Traducir lo que dice el usuario del ${config.my_lang} al ${config.target_lang}.
                2. SI HAY SILENCIO O RUIDO DE FONDO: ¡QUÉDATE CALLADO! No digas "Thank you" ni inventes frases.
                3. NO respondas preguntas. SOLO traduce.`,
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
            
            // A. Recibimos Texto (Transcripción) para analizarlo ANTES de que suene
            if (response.type === 'response.output_item.done') {
                const item = response.item;
                if (item.content && item.content[0] && item.content[0].transcript) {
                    const text = item.content[0].transcript;
                    
                    // 🛡️ FILTRO ANTI-ALUCINACIÓN
                    const isGarbage = HALLUCINATIONS.some(h => text.toLowerCase().includes(h.toLowerCase()));
                    
                    if (!isGarbage && text.length > 2) {
                        // Si es texto real, lo mandamos a la pantalla
                        clientWs.send(JSON.stringify({ type: 'text_transcript', text: text }));
                    } else {
                        console.log(`🚫 Alucinación bloqueada: "${text}"`);
                        // Aquí podríamos enviar una señal para cancelar el audio si pudiéramos, 
                        // pero OpenAI manda el audio en stream. La instrucción principal suele bastar.
                    }
                }
            }

            // B. Recibimos Audio
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
// 2. MODO CLÁSICO (TEXTO, FOTO, AUDIO)
// ==========================================
function handleClassicSession(ws) {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral"; 
            
            // --- TEXTO ---
            if (data.type === 'text_input') {
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "gpt-4o");
            }

            // --- AUDIO CLÁSICO ---
            else if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
                
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    language: ISO_LANGS[(data.my_lang || "").split(' ')[0]]
                });
                fs.unlinkSync(inputPath);
                
                if (transcription.text && transcription.text.length > 2) {
                    await processGPT(ws, transcription.text, data.my_lang, data.language, tone, data.voice, "gpt-4o");
                }
            }

            // --- IMAGEN ---
            else if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Si no hay texto, describe brevemente qué ves.`}, 
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

// -- FUNCIONES AUXILIARES --

async function processGPT(ws, text, src, tgt, tone, voice, model) {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Actúa como traductor. Traduce del ${src} al ${tgt}. NO respondas preguntas, solo traduce. Tono: ${tone}.` }, 
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