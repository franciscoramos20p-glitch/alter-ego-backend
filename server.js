import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import stringSimilarity from 'string-similarity';

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO V67 (ANTI-ALUCINACIONES PRO): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗑️ LISTA NEGRA EXTENDIDA (Basada en tus capturas)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "...", "..", "." // Puntos suspensivos solos
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // =================================================================
            // 🎙️ AUDIO INPUT
            // =================================================================
            if (data.type === 'audio_input') {
                const rawLangA = data.langSource || data.my_lang || "Español";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés";
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // 1. WHISPER (Con prompt anti-alucinaciones)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        // Prompt clave para reducir alucinaciones en silencios
                        prompt: "Hello. This is a direct conversation. No subtitles. No copyright info.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // 2. FILTRO DE LIMPIEZA (CAPA 1)
                    // Eliminar caracteres repetidos locos (ej: "ლლლ...")
                    if (/(.)\1{4,}/.test(userText)) { 
                        console.log(`🗑️ Alucinación de caracteres detectada: ${userText.substring(0, 20)}...`);
                        try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    // 3. FILTRO DE LISTA NEGRA (CAPA 2)
                    const lowerText = userText.toLowerCase();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(trigger => lowerText.includes(trigger.toLowerCase()))) {
                        console.log(`🔇 Alucinación bloqueada: "${userText}"`); 
                        try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    // 4. ANTI-ECO (CAPA 3)
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.4 || lowerText.includes(ws.lastAiResponse.toLowerCase().slice(0, 25))) {
                            console.log(`☢️ ECO DETECTADO: "${userText}"`);
                            try { fs.unlinkSync(tempIn); } catch(e){} return; 
                        }
                    }

                    console.log(`🗣️ Oído Limpio: "${userText}"`);

                    // 5. CEREBRO TRADUCTOR (GPT-4o)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER for these two languages:
                                1. ${rawLangA}
                                2. ${rawLangB}

                                LOGIC RULES:
                                - If input is in ${rawLangA} => Translate to ${rawLangB}.
                                - If input is in ${rawLangB} => Translate to ${rawLangA}.
                                - NEVER repeat the input.
                                - NO explanation. JUST the translation.
                                
                                ANTI-HALLUCINATION RULES:
                                - If the input is "Subtitles by...", "Copyright...", "Thanks for watching...", or random characters => Return "SILENCE".
                                - If the input makes no sense or is just noise => Return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || !aiText || aiText.trim().length === 0) {
                        console.log("🤫 IA decidió guardar silencio.");
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 6. VOZ (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioBase64 = bufferTTS.toString('base64');

                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: audioBase64 }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) { try { fs.unlinkSync(tempIn); } catch(e){} }
            }
            
            // ... (TEXTO E IMAGEN SIGUEN IGUAL) ...
            else if (data.type === 'text_input') {
                // ... (Mismo código de chat)
                const langA = data.my_lang || "Español";
                const langB = data.language || "Inglés";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `Translate from ${langA} to ${langB} (or vice versa). Output ONLY translation.` }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {}
            }
             else if (data.type === 'image_input') {
                 // ... (Mismo código de cámara)
                 const langTarget = data.language || "English";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [{ role: "user", content: [{ type: "text", text: `Look for ANY text in this image. If found, TRANSLATE it to ${langTarget}. If there is NO text, briefly describe what you see in ${langTarget}. Output ONLY the result.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }] }],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "📸 [Imagen Analizada]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {}
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});