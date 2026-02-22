import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk'; 
import { createClient } from '@deepgram/sdk';
import fetch from 'node-fetch'; 
import FormData from 'form-data'; // 🔥 Necesario para enviar el audio a Whisper

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 
const SIMULATOR_SECRET_KEY = "ALTER_ROLEPLAY_SECRET_2026";
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

console.log(`🏆 SERVIDOR V116 (WHISPER FALLBACK + ROLEPLAY MEMORY): Puerto: ${PORT}`);

// =================================================================
// 🌍 LISTA MAESTRA DE 100 IDIOMAS
// =================================================================
const LANGUAGES = [
    { code: 'es', name: 'Español', serverName: 'Spanish' },
    { code: 'en', name: 'Inglés', serverName: 'English' },
    { code: 'fr', name: 'Francés', serverName: 'French' },
    { code: 'de', name: 'Alemán', serverName: 'German' },
    { code: 'it', name: 'Italiano', serverName: 'Italian' },
    { code: 'pt-BR', name: 'Portugués (BR)', serverName: 'Portuguese (Brazil)' },
    { code: 'zh-CN', name: 'Chino (Simpl)', serverName: 'Chinese (Simplified)' },
    { code: 'ja', name: 'Japonés', serverName: 'Japanese' },
    { code: 'ko', name: 'Coreano', serverName: 'Korean' },
    { code: 'ru', name: 'Ruso', serverName: 'Russian' },
    { code: 'ar', name: 'Árabe', serverName: 'Arabic' },
    { code: 'hi', name: 'Hindi', serverName: 'Hindi' },
    { code: 'pt-PT', name: 'Portugués (EU)', serverName: 'Portuguese (Portugal)' },
    { code: 'nl', name: 'Holandés', serverName: 'Dutch' },
    { code: 'tr', name: 'Turco', serverName: 'Turkish' },
    { code: 'pl', name: 'Polaco', serverName: 'Polish' },
    { code: 'sv', name: 'Sueco', serverName: 'Swedish' },
    { code: 'uk', name: 'Ucraniano', serverName: 'Ukrainian' },
    { code: 'da', name: 'Danés', serverName: 'Danish' },
    { code: 'no', name: 'Noruego', serverName: 'Norwegian' },
    { code: 'fi', name: 'Finlandés', serverName: 'Finnish' },
    { code: 'el', name: 'Griego', serverName: 'Greek' },
    { code: 'cs', name: 'Checo', serverName: 'Czech' },
    { code: 'hu', name: 'Húngaro', serverName: 'Hungarian' },
    { code: 'ro', name: 'Rumano', serverName: 'Romanian' },
    { code: 'ca', name: 'Catalán', serverName: 'Catalan' },
    { code: 'eu', name: 'Euskera', serverName: 'Basque' },
    { code: 'gl', name: 'Gallego', serverName: 'Galician' },
    { code: 'hr', name: 'Croata', serverName: 'Croatian' },
    { code: 'sr', name: 'Serbio', serverName: 'Serbian' },
    { code: 'sk', name: 'Eslovaco', serverName: 'Slovenian' },
    { code: 'sl', name: 'Esloveno', serverName: 'Slovenian' },
    { code: 'bg', name: 'Búlgaro', serverName: 'Bulgarian' },
    { code: 'et', name: 'Estonio', serverName: 'Estonian' },
    { code: 'lv', name: 'Letón', serverName: 'Latvian' },
    { code: 'lt', name: 'Lituano', serverName: 'Lithuanian' },
    { code: 'is', name: 'Islandés', serverName: 'Icelandic' },
    { code: 'ga', name: 'Irlandés', serverName: 'Irish' },
    { code: 'cy', name: 'Galés', serverName: 'Welsh' },
    { code: 'mt', name: 'Maltés', serverName: 'Maltese' },
    { code: 'sq', name: 'Albanés', serverName: 'Albanian' },
    { code: 'mk', name: 'Macedonio', serverName: 'Macedonian' },
    { code: 'bs', name: 'Bosnio', serverName: 'Bosnian' },
    { code: 'be', name: 'Bielorruso', serverName: 'Belarusian' },
    { code: 'lb', name: 'Luxemburgués', serverName: 'Luxembourgish' },
    { code: 'zh-TW', name: 'Chino (Trad)', serverName: 'Chinese (Traditional)' },
    { code: 'th', name: 'Tailandés', serverName: 'Thai' },
    { code: 'vi', name: 'Vietnamita', serverName: 'Vietnamese' },
    { code: 'id', name: 'Indonesio', serverName: 'Indonesian' },
    { code: 'ms', name: 'Malayo', serverName: 'Malay' },
    { code: 'tl', name: 'Filipino', serverName: 'Tagalog' },
    { code: 'my', name: 'Birmano', serverName: 'Burmese' },
    { code: 'km', name: 'Jemer', serverName: 'Khmer' },
    { code: 'lo', name: 'Laosiano', serverName: 'Lao' },
    { code: 'ne', name: 'Nepalí', serverName: 'Nepali' },
    { code: 'si', name: 'Cingalés', serverName: 'Sinhala' },
    { code: 'mn', name: 'Mongol', serverName: 'Mongolian' },
    { code: 'kk', name: 'Kazajo', serverName: 'Kazakh' },
    { code: 'uz', name: 'Uzbeko', serverName: 'Uzbek' },
    { code: 'ky', name: 'Kirguís', serverName: 'Kyrgyz' },
    { code: 'tg', name: 'Tayiko', serverName: 'Tajik' },
    { code: 'he', name: 'Hebreo', serverName: 'Hebrew' },
    { code: 'fa', name: 'Persa (Farsi)', serverName: 'Persian' },
    { code: 'ps', name: 'Pastún', serverName: 'Pashto' },
    { code: 'ku', name: 'Kurdo', serverName: 'Kurdish' },
    { code: 'hy', name: 'Armenio', serverName: 'Armenian' },
    { code: 'az', name: 'Azerí', serverName: 'Azerbaijani' },
    { code: 'ka', name: 'Georgiano', serverName: 'Georgian' },
    { code: 'bn', name: 'Bengalí', serverName: 'Bengali' },
    { code: 'pa', name: 'Punyabí', serverName: 'Punjabi' },
    { code: 'ta', name: 'Tamil', serverName: 'Tamil' },
    { code: 'te', name: 'Telugu', serverName: 'Telugu' },
    { code: 'mr', name: 'Maratí', serverName: 'Marathi' },
    { code: 'ur', name: 'Urdu', serverName: 'Urdu' },
    { code: 'gu', name: 'Guyaratí', serverName: 'Gujarati' },
    { code: 'kn', name: 'Canarés', serverName: 'Kannada' },
    { code: 'ml', name: 'Malayalam', serverName: 'Malayalam' },
    { code: 'sw', name: 'Suajili', serverName: 'Swahili' },
    { code: 'am', name: 'Amárico', serverName: 'Amharic' },
    { code: 'so', name: 'Somalí', serverName: 'Somali' },
    { code: 'zu', name: 'Zulú', serverName: 'Zulu' },
    { code: 'xh', name: 'Xhosa', serverName: 'Xhosa' },
    { code: 'af', name: 'Afrikáans', serverName: 'Afrikaans' },
    { code: 'yo', name: 'Yoruba', serverName: 'Yoruba' },
    { code: 'ig', name: 'Igbo', serverName: 'Igbo' },
    { code: 'ha', name: 'Hausa', serverName: 'Hausa' },
    { code: 'ht', name: 'Criollo Haitiano', serverName: 'Haitian Creole' },
    { code: 'gn', name: 'Guaraní', serverName: 'Guarani' },
    { code: 'qu', name: 'Quechua', serverName: 'Quechua' },
    { code: 'eo', name: 'Esperanto', serverName: 'Esperanto' },
    { code: 'la', name: 'Latín', serverName: 'Latin' },
    { code: 'mg', name: 'Malgache', serverName: 'Malagasy' },
    { code: 'mi', name: 'Maorí', serverName: 'Maori' },
    { code: 'sm', name: 'Samoano', serverName: 'Samoan' },
    { code: 'haw', name: 'Hawaiano', serverName: 'Hawaiian' },
    { code: 'jw', name: 'Javanés', serverName: 'Javanese' },
    { code: 'su', name: 'Sundanés', serverName: 'Sundanese' },
    { code: 'yi', name: 'Yidis', serverName: 'Yiddish' }
];

function getLangCode(serverName) {
    if (!serverName) return 'en';
    const found = LANGUAGES.find(l => l.serverName.toLowerCase() === serverName.toLowerCase());
    return found ? found.code : 'en';
}

function sanitizeAiResponse(text) {
    if (!text) return "";
    let clean = text;
    clean = clean.replace(/<[^>]*>/g, ""); 
    clean = clean.replace(/\*\*/g, "").replace(/\*/g, ""); 
    clean = clean.replace(/Translation:/gi, "").replace(/Translated text:/gi, "");
    clean = clean.replace(/^["']|["']$/g, ""); 
    return clean.trim();
}

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// 🔥 FUNCIÓN DEL OÍDO WHISPER (FALLBACK) 🔥
async function transcribeWithWhisper(audioBuffer) {
    try {
        console.log("👂 Intentando con OpenAI Whisper (Fallback)...");
        const formData = new FormData();
        // Whisper necesita un nombre de archivo falso para reconocer el buffer
        formData.append('file', audioBuffer, { filename: 'audio.m4a', contentType: 'audio/mp4' });
        formData.append('model', 'whisper-1');

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        const data = await response.json();
        return data.text ? data.text.trim() : null;
    } catch (e) {
        console.error("Error en Whisper:", e.message);
        return null;
    }
}

wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 
    console.log(`⚡ Cliente Conectado`);
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 20) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                let realCredits = 0;
                if (data.user_id) {
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) realCredits = parseFloat(userData.credits);
                    } catch (err) {}
                }
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            if (data.type === 'tts_request') {
                if (data.simulator_key === SIMULATOR_SECRET_KEY && data.openai_voice) {
                    try {
                        const validVoice = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'alloy';
                        const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                            body: JSON.stringify({ model: "tts-1", input: data.text, voice: validVoice })
                        });
                        const arrayBuffer = await ttsResponse.arrayBuffer();
                        const base64Audio = Buffer.from(arrayBuffer).toString('base64');
                        ws.send(JSON.stringify({ type: 'full_response', user_text: null, ai_text: data.text, audio: base64Audio }));
                    } catch (err) { console.error("Error TTS:", err.message); }
                }
                return;
            }

            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);

            // =================================================================
            // 🎙️ MODO AUDIO
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    let userText = "";
                    let detectedCode = codeB;

                    // 1. PRIMER INTENTO: DEEPGRAM
                    try {
                        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                            audioBuffer, { model: "nova-2", smart_format: true, punctuate: true }
                        );
                        if (!error) {
                            userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim() || "";
                            detectedCode = result.results?.channels[0]?.alternatives[0]?.detected_language || codeB;
                        }
                    } catch (e) { console.error("Deepgram falló, intentando Whisper..."); }

                    // 2. SEGUNDO INTENTO: WHISPER (Si Deepgram no entendió nada o era un idioma raro)
                    if (!userText || userText.length < 1) {
                        userText = await transcribeWithWhisper(audioBuffer);
                        detectedCode = "auto"; // Whisper autodetecta genialmente
                    }

                    // 3. SI AMBOS FALLAN: Avisamos al frontend
                    if (!userText || userText.length < 1) {
                        console.log("🔇 Silencio absoluto. Cancelando turno.");
                        ws.send(JSON.stringify({ type: 'error_audio_empty' }));
                        return;
                    }

                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    let groqMessages = [];
                    let temp = 0.0;
                    let maxTokens = 500;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        const personalityPrompt = data.tone + "\nEXTREMELY IMPORTANT: Act as a real human. Use filler words, laugh (*laughs*), sigh (*sighs*). KEEP YOUR ANSWERS SHORT AND CONCISE (maximum 2-3 sentences). Do not give long speeches.";
                        groqMessages.push({ role: "system", content: personalityPrompt });
                        
                        // HISTORIAL (Memoria vital para el simulador)
                        if (data.history && Array.isArray(data.history)) {
                            const safeHistory = data.history.slice(-6); 
                            safeHistory.forEach(msg => {
                                if (msg.text && (msg.role === 'user' || msg.role === 'ai')) {
                                    groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                                }
                            });
                        }
                        temp = 0.7; 
                        maxTokens = 200; 
                    } else {
                        // SIN MEMORIA: El traductor clásico no necesita recordar nada
                        groqMessages.push({ role: "system", content: `You are a STRICT TRANSLATION ENGINE. You are NOT a chatbot. LANGUAGES: Source A: ${langNameA} - Source B: ${langNameB}. CRITICAL RULES: DO NOT answer questions. Output ONLY the raw translated text.` });
                    }

                    groqMessages.push({ role: "user", content: userText });

                    const stream = await groq.chat.completions.create({
                        messages: groqMessages,
                        model: "llama-3.3-70b-versatile",
                        temperature: temp,
                        max_tokens: maxTokens,
                        stream: true
                    });
                    
                    let aiText = "";
                    for await (const chunk of stream) { aiText += chunk.choices[0]?.delta?.content || ""; }
                    aiText = sanitizeAiResponse(aiText);
                    if (!aiText) return;

                    let base64Audio = null;
                    if (data.simulator_key === SIMULATOR_SECRET_KEY && data.openai_voice) {
                        try {
                            const validVoice = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'alloy';
                            const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ model: "tts-1", input: aiText, voice: validVoice })
                            });
                            const arrayBuffer = await ttsResponse.arrayBuffer();
                            base64Audio = Buffer.from(arrayBuffer).toString('base64');
                        } catch (err) { console.error("Error OpenAI TTS:", err.message); }
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        detected_lang: detectedCode, 
                        audio: base64Audio 
                    }));

                } catch (error) { console.error("Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO 
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    let groqMessages = [];
                    let temp = 0.0;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        groqMessages.push({ role: "system", content: data.tone });
                        if (data.history && Array.isArray(data.history)) {
                            data.history.slice(-6).forEach(msg => {
                                if (msg.text) groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                            });
                        }
                        temp = 0.7;
                    } else {
                        groqMessages.push({ role: "system", content: `You are a STRICT TRANSLATION ENGINE. Context: Languages are ${langNameA} and ${langNameB}. Task: Translate input to the other language. RULES: DO NOT answer questions. Output ONLY the raw translation.` });
                    }

                    groqMessages.push({ role: "user", content: data.text });

                    const stream = await groq.chat.completions.create({
                        messages: groqMessages,
                        model: "llama-3.3-70b-versatile", 
                        stream: true,
                        temperature: temp
                    });

                    let aiText = "";
                    for await (const chunk of stream) { aiText += chunk.choices[0]?.delta?.content || ""; }
                    aiText = sanitizeAiResponse(aiText);
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio: null }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }
        } catch (e) { console.error("WS Error:", e.message); }
    });
});