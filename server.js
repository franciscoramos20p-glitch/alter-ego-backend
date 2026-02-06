import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`🛡️ SERVIDOR FINAL V116 (AUDIO + TEXTO MILITAR): Puerto ${PORT}`);

// 🎭 MAPEO DE VOCES
const VOICE_MAP = {
    "alloy": "aura-orion-en",   
    "echo": "aura-arcas-en",    
    "fable": "aura-athena-en",  
    "onyx": "aura-perseus-en",  
    "nova": "aura-asteria-en",  
    "shimmer": "aura-luna-en"   
};

// 🚫 LISTA NEGRA
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Translated by", "watching", 
    "Please subscribe", "sous-titres", "captioned", 
    "999", "1234", "00:00", ". . .", "..."
];

function isEcho(text1, text2) {
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase()) > 0.85;
}

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', () => clearInterval(interval));

// ==========================================
// 🔌 CONEXIÓN WEBSOCKET
// ==========================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 
    ws.lastAiResponse = ""; 

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 50) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) ws.close();
                else ws.send(JSON.stringify({ type: 'auth_success' })); 
                return;
            }

            // Configuración común
            const langA = data.langSource || "Spanish";
            const langB = data.langTarget || "English";
            const isFastMode = data.fastMode === true;
            const targetVoiceModel = VOICE_MAP[data.voice || "nova"] || "aura-asteria-en";

            // =================================================================
            // 🎙️ 1. MODO AUDIO (Blindado)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // STT Deepgram
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        { model: "nova-2", smart_format: true, detect_language: true, punctuate: true }
                    );
                    if (error) throw new Error("STT Error");
                    
                    let userText = result.results.channels[0].alternatives[0].transcript.trim();
                    let detectedCode = result.results.channels[0].alternatives[0].detected_language;

                    if (userText.length < 2) return;
                    if (HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                    console.log(`🗣️ Audio In: "${userText}" (${detectedCode})`);

                    // PROMPT MILITAR (AUDIO)
                    const systemPrompt = `
                    TASK: TRANSLATE INPUT TEXT.
                    CONTEXT: User Languages: ${langA} & ${langB}. Detected Audio: ${detectedCode}.
                    LOGIC: If input is ${langA} -> ${langB}. If ${langB} -> ${langA}.
                    CRITICAL: OUTPUT ONLY TRANSLATION. NO CHAT. NO EXPLANATIONS.
                    INPUT TEXT: "${userText}"
                    `;

                    const completion = await groq.chat.completions.create({
                        messages: [{ role: "system", content: systemPrompt }],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0, 
                        max_tokens: 256
                    });
                    
                    let aiText = completion.choices[0].message.content.trim().replace(/"/g, '').replace(/Translation:/gi, '').trim();

                    if (isEcho(userText, aiText)) return; // Anti-Loro
                    if (!aiText || aiText === "SILENCE") return;

                    console.log(`✅ Traducción: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // TTS
                    let audioB64 = null;
                    if (!isFastMode) {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: aiText })
                        });
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            audioB64 = Buffer.from(arrayBuffer).toString('base64');
                        }
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Audio Error:", error.message); }
            }
            
            // =================================================================
            // 📝 2. MODO TEXTO (AQUÍ ESTÁ LO QUE FALTABA)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    console.log(`📝 Texto In: "${data.text}"`);
                    
                    // PROMPT MILITAR (TEXTO)
                    // Usamos la misma lógica agresiva para que no converse al escribir
                    const systemPrompt = `
                    TASK: TRANSLATE.
                    FROM: ${langA} (or detected)
                    TO: The other language (${langB}).
                    CRITICAL: OUTPUT ONLY TRANSLATION. NO CHAT. NO ANSWERS.
                    INPUT TEXT: "${data.text}"
                    `;

                    // Usamos stream para que aparezca letra por letra en el celular
                    const stream = await groq.chat.completions.create({
                        messages: [{ role: "system", content: systemPrompt }],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0, // Cero creatividad = Cero charla
                        stream: true
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            // Enviamos letra por letra al frontend
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    
                    aiText = aiText.trim();
                    ws.lastAiResponse = aiText;
                    console.log(`📝 Traducción: "${aiText}"`);

                    // Generar Audio final (Si no es Flash Mode)
                    let audioB64 = null;
                    if (aiText && !isFastMode) {
                         const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: aiText })
                        });
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            audioB64 = Buffer.from(arrayBuffer).toString('base64');
                        }
                    }

                    // Enviar respuesta final para cerrar el ciclo
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch(e) { console.error("❌ Texto Error:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});