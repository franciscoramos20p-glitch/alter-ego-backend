import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ FFMPEG CONFIG
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V17 (SAMSUNG UNLOCKED): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ FILTRO BASURA (Mantenemos esto para que no traduzca ruido)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "watching", "Please subscribe", 
    "Me gusta", "blue skies", "sous-titres", "Silence", "Ruido", 
    "subtítulos", "captioned", "Audio", "Transcribe"
];

const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it',
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru'
};

function createWavHeader(dataLength) {
    const sampleRate = 24000;
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); 
    buffer.writeUInt16LE(1, 20); 
    buffer.writeUInt16LE(1, 22); 
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32); 
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // ==========================
            // 🔴 MODO LIVE
            // ==========================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "es";
                const lang2 = data.config?.lang2 || "en";

                openAiWs.on('open', () => {
                    console.log("✅ OpenAI Conectado");
                    ws.send(JSON.stringify({ type: 'debug', msg: 'Sistemas Listos 🟢' }));

                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `You are a professional interpreter. Translate between ${lang1} and ${lang2}. Do not chat. Do not explain. Just translate.`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: { 
                                type: "server_vad", 
                                threshold: 0.4, // Umbral balanceado para Samsung
                                prefix_padding_ms: 300,
                                silence_duration_ms: 600
                            }
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);
                        ws.send(JSON.stringify({ type: 'audio_stream', audio: wavBuffer.toString('base64') }));
                    }
                    
                    if (response.type === 'input_audio_buffer.speech_started') {
                        ws.send(JSON.stringify({ type: 'vad_start' }));
                        openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
                    }
                });
            }

            // RECIBIR AUDIO LIVE (SIN RESTRICCIONES DE FORMATO)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                // LOG VITAL: ESTO DEBE APARECER EN TU CONSOLA NEGRA
                console.log(`📨 AUDIO RECIBIDO: ${data.payload.length} bytes`);

                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    // 🔥 FFMPEG AUTOMÁTICO (Sin inputFormat forzado)
                    ffmpeg(tempIn)
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .on('error', (err) => console.error("❌ Error FFMPEG:", err))
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                // Limpieza rápida
                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        });
                } catch (e) { console.error("FS Error:", e); }
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
            }

            // ==========================
            // MODO CLÁSICO (CHAT)
            // ==========================
            else if (['audio_input', 'text_input'].includes(data.type) && !openAiWs) {
                await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});

async function handleClassicRequest(ws, data) {
    try {
        let userText = "";
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `chat_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            const langCode = data.my_lang ? (ISO_LANGS[data.my_lang.split(' ')[0]] || undefined) : undefined;
            const transcription = await openai.audio.transcriptions.create({ file: fs.createReadStream(inputPath), model: "whisper-1", language: langCode });
            try { fs.unlinkSync(inputPath); } catch(e){}
            userText = transcription.text;
        } else {
            userText = data.text;
        }

        const cleanText = userText ? userText.trim() : "";
        // Filtro de basura
        if (cleanText.length < 2 || HALLUCINATIONS.some(h => cleanText.toLowerCase().includes(h.toLowerCase()))) {
            console.log("🚫 Texto ignorado:", cleanText);
            return;
        }

        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "Translate only. No chat." }, { role: "user", content: cleanText }],
            model: "gpt-4o", max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;
        const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: data.voice || "alloy", input: aiText, speed: 1.1 });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: buffer.toString('base64') }));

    } catch (e) { console.error("Error Chat:", e); }
}