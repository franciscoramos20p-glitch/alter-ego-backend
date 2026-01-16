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

console.log(`🚀 SERVIDOR V27 (DIAGNOSTICO TOTAL): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🔧 Header WAV
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
                console.log("🎙️ Iniciando Live V27...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                openAiWs.on('open', () => {
                    console.log("✅ OpenAI Conectado");
                    ws.send(JSON.stringify({ type: 'debug', msg: 'Conectado a IA 🟢' }));

                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `You are a helper. 
                            ALWAYS reply with AUDIO. 
                            If you hear silence, say "SILENCIO DETECTADO".
                            If you hear noise, say "RUIDO DETECTADO".
                            Do not stay quiet. Speak loudly.`,
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
                    
                    // 🔍 LOGUEAR TODO LO QUE NO SEA AUDIO PURO (Para no llenar la pantalla de basura binary)
                    if (response.type !== 'response.audio.delta') {
                        console.log(`🤖 IA MSG: ${response.type}`);
                    }

                    // Si hay error, lo gritamos
                    if (response.type === 'error') {
                        console.error("❌ ERROR IA:", response.error.message);
                        ws.send(JSON.stringify({ type: 'debug', msg: 'Error IA: ' + response.error.message }));
                    }

                    // Si la sesión se crea
                    if (response.type === 'session.created') {
                        console.log("✨ Sesión IA Creada");
                    }

                    // Si la respuesta se crea
                    if (response.type === 'response.created') {
                        console.log("🚀 IA: Empezando a generar respuesta...");
                    }

                    // Si termina la respuesta
                    if (response.type === 'response.done') {
                        console.log("🏁 IA: Respuesta terminada.");
                    }

                    // 🔊 AUDIO DELTA (LO QUE QUEREMOS)
                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);
                        
                        // Solo logueamos cada 20 paquetes para no saturar, pero enviamos TODOS
                        if (Math.random() > 0.9) process.stdout.write('.'); 
                        
                        ws.send(JSON.stringify({ type: 'audio_stream', audio: wavBuffer.toString('base64') }));
                    }
                });
            }

            // RECIBIR AUDIO
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                console.log(`📨 RECIBIDO: ${data.payload.length} bytes`);

                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    ffmpeg(tempIn)
                        // Sin inputFormat forzado (Auto-detect Samsung)
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                
                                if (pcmData.length < 1000) {
                                    console.log("⚠️ Audio < 1KB. Descartado.");
                                    ws.send(JSON.stringify({ type: 'debug', msg: 'Audio vacío (Mic?)' }));
                                    return;
                                }

                                console.log(`✅ FFMPEG OK (${pcmData.length} bytes) -> Enviando...`);
                                
                                // 1. Limpiar buffer anterior (Por si acaso)
                                openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));

                                // 2. Enviar Audio Nuevo
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                
                                // 3. FORZAR RESPUESTA (Con pausa de 500ms)
                                setTimeout(() => {
                                    console.log("🔥 COMANDO: ¡HABLA!");
                                    openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                                }, 500);

                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        })
                        .on('error', (err) => {
                            console.error("❌ FFMPEG Error:", err);
                            ws.send(JSON.stringify({ type: 'debug', msg: 'Error Formato Audio' }));
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("FS Error:", e); }
            }

            // CHAT CLÁSICO (Código base)
            else if (['audio_input', 'text_input'].includes(data.type) && !openAiWs) {
                // (Misma lógica de chat clásico que ya tienes)
                // Se omite aquí por brevedad, pero asegúrate de mantenerla si usas el archivo completo.
                // Si la necesitas, avísame.
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});