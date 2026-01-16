import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ FFMPEG
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V29 (PRUEBA DE VIDA): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Header WAV para reproducción en Android
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

            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live V29...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                openAiWs.on('open', () => {
                    console.log("✅ OpenAI Conectado");
                    ws.send(JSON.stringify({ type: 'debug', msg: 'Conectado - Iniciando Test...' }));

                    // 1. Configurar Sesión
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: "You are a helpful assistant. Always speak loudly and clearly.",
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: null // Manual total
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));

                    // 2. 🔥 PRUEBA DE VIDA AUTOMÁTICA
                    // Enviamos un TEXTO para forzar que la IA hable sin depender del micrófono
                    setTimeout(() => {
                        console.log("📢 EJECUTANDO PRUEBA DE SONIDO (TEXTO -> AUDIO)");
                        openAiWs.send(JSON.stringify({
                            type: "conversation.item.create",
                            item: {
                                type: "message",
                                role: "user",
                                content: [{ type: "input_text", text: "Di la frase: 'Sistema operativo, conexión exitosa'." }]
                            }
                        }));
                        openAiWs.send(JSON.stringify({ type: "response.create" }));
                    }, 1000);
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);

                    if (response.type === 'error') {
                        console.error("❌ ERROR IA:", response.error.message);
                        ws.send(JSON.stringify({ type: 'debug', msg: 'Error IA: ' + response.error.message }));
                    }

                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);
                        
                        console.log(`🔊 AUDIO RECIBIDO (${wavBuffer.length}b) -> APP`);
                        ws.send(JSON.stringify({ type: 'audio_stream', audio: wavBuffer.toString('base64') }));
                    }
                });
            }

            // PROCESAMIENTO DE AUDIO (MICROFONO)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                console.log(`📨 MIC RECIBIDO: ${data.payload.length} bytes`);

                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    ffmpeg(tempIn)
                        // 🔥 CAMBIO CRÍTICO: Forzar decodificación AAC (Lo que usa Samsung)
                        // No usamos .inputFormat('m4a'), dejamos que ffmpeg detecte el header
                        // pero forzamos los parámetros de salida PCM.
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                
                                // Validación estricta de tamaño
                                if (pcmData.length < 2000) {
                                    console.log("⚠️ Audio vacío/ruido (Mic fallando).");
                                    return;
                                }

                                console.log(`✅ FFMPEG OK -> Enviando a IA...`);
                                
                                // Enviar y forzar respuesta
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                
                                setTimeout(() => {
                                    openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                                }, 500);

                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        })
                        .on('error', (err) => {
                            console.error("❌ FFMPEG Error:", err);
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("FS Error:", e); }
            }
            
            // CHAT CLÁSICO (Código existente...)
            else if (['audio_input', 'text_input'].includes(data.type) && !openAiWs) {
                 await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});

// Función Classic necesaria
async function handleClassicRequest(ws, data) {
    try {
        let userText = "";
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `chat_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            const langCode = "es"; // Simplificado para evitar errores
            const transcription = await openai.audio.transcriptions.create({ file: fs.createReadStream(inputPath), model: "whisper-1", language: langCode });
            try { fs.unlinkSync(inputPath); } catch(e){}
            userText = transcription.text;
        } else { userText = data.text; }

        if (!userText) return;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: userText }],
            model: "gpt-4o"
        });
        const aiText = completion.choices[0].message.content;
        const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: buffer.toString('base64') }));
    } catch (e) { console.error("Error Chat:", e); }
}