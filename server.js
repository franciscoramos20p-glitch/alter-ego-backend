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

console.log(`🚀 SERVIDOR V23 (AUDIO FORCE): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

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
                console.log("🎙️ Iniciando Live V23...");
                
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
                    ws.send(JSON.stringify({ type: 'debug', msg: 'IA Lista (V23)' }));

                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `You are a translator between ${lang1} and ${lang2}. 
                            IMPORTANT: You MUST reply with AUDIO. 
                            If you hear silence or noise, say "I didn't hear you" in the target language.
                            Translate exactly what you hear.`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: null // Manual Mode
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    // 🔍 DEBUGGING: Ver errores
                    if (response.type === 'error') {
                        console.error("❌ ERROR IA:", response.error.message);
                    }

                    // 🔍 DEBUGGING: Ver si responde Texto
                    if (response.type === 'response.text.delta') {
                        console.log("📝 IA (Texto):", response.delta);
                    }

                    // 🔊 AUDIO
                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);
                        
                        console.log(`⬅️ AUDIO SALIENTE (${wavBuffer.length} bytes)`);
                        ws.send(JSON.stringify({ type: 'audio_stream', audio: wavBuffer.toString('base64') }));
                    }
                });
            }

            // RECIBIR AUDIO (Mismo bloque V22 que funcionaba bien)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                console.log(`📨 RECIBIDO: ${data.payload.length} bytes`);

                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    ffmpeg(tempIn)
                        .inputFormat('m4a')
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                
                                if (pcmData.length < 1000) {
                                    console.log("⚠️ Audio vacío. Ignorando.");
                                    return;
                                }

                                console.log(`✅ FFMPEG OK -> Enviando a OpenAI...`);
                                
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                
                                // 🔥 DOBLE CONFIRMACIÓN + FORCE RESPONSE
                                setTimeout(() => {
                                    openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                                    openAiWs.send(JSON.stringify({ 
                                        type: 'response.create',
                                        response: {
                                            modalities: ["audio", "text"], // 👈 FORZAMOS AUDIO AQUÍ TAMBIÉN
                                        }
                                    }));
                                    console.log("🚀 COMANDO: ¡HABLA AHORA!");
                                }, 100); 

                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        })
                        .on('error', (err) => {
                            console.error("❌ FFMPEG Error:", err);
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("FS Error:", e); }
            }

            // CHAT CLÁSICO (Sin cambios)
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
        } else { userText = data.text; }

        const cleanText = userText ? userText.trim() : "";
        if (cleanText.length < 2) return;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "Translate exactly." }, { role: "user", content: cleanText }],
            model: "gpt-4o", max_tokens: 300
        });
        const aiText = completion.choices[0].message.content;
        const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: data.voice || "alloy", input: aiText, speed: 1.1 });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: buffer.toString('base64') }));
    } catch (e) { console.error("Error Chat:", e); }
}