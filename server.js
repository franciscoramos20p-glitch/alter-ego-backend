import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk'; 
import { createClient } from '@deepgram/sdk';
import fetch from 'node-fetch'; 

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// 🔑 CONFIGURACIÓN DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 

console.log(`🏆 SERVIDOR V112 (PREMIUM VOICES + STRICT TRANSLATOR): Puerto: ${PORT}`);

// 🎭 MAPEO DE VOCES PREMIUM
// Si la app pide 'alloy' o 'nova', usamos las voces Ultra-Rápidas de Deepgram Aura.
const VOICE_MAP = {
    "alloy": "aura-orion-en",   // Masculino (Similar a Alloy)
    "nova": "aura-asteria-en"   // Femenino (Similar a Nova)
};

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
    clean = clean.replace(/<[^>]*>/g, ""); // Borra tags XML
    clean = clean.replace(/\*\*/g, "").replace(/\*/g, ""); // Borra Markdown
    clean = clean.replace(/Translation:/gi, "").replace(/Translated text:/gi, "");
    clean = clean.replace(/^["']|["']$/g, ""); // Borra comillas
    return clean.trim();
}

// 💓 HEARTBEAT
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

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 20) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // 🔐 AUTH
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

            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);
            
            // 🎙️ DETECCIÓN DE VOZ PREMIUM
            // Si la app envía 'alloy' o 'nova', buscamos su equivalente en Deepgram.
            const requestedVoice = data.voice || "device_default";
            const premiumVoiceModel = VOICE_MAP[requestedVoice]; // Será undefined si es 'device_default'

            // =================================================================
            // 🎙️ MODO AUDIO
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. DEEPGRAM (OÍDO)
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        { 
                            model: "nova-2", 
                            detect_language: [codeA, codeB], 
                            smart_format: true,
                            punctuate: true, 
                            utterances: true,
                            mimetype: 'audio/mp4' 
                        }
                    );

                    if (error) throw new Error("Deepgram Error");
                    
                    let userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim();
                    let detectedCode = result.results?.channels[0]?.alternatives[0]?.detected_language; 

                    if (!userText || userText.length < 1) {
                        console.log("🔇 Silencio o ruido detectado. Ignorando.");
                        return;
                    }
                    
                    console.log(`🗣️ [Escuchado (${detectedCode})]: "${userText}"`);

                    // 2. GROQ (CEREBRO 70B - LOBOTOMIZADO)
                    const systemPrompt = `
                    You are a STRICT TRANSLATION ENGINE. You are NOT a chatbot.
                    
                    LANGUAGES:
                    - Source A: ${langNameA}
                    - Source B: ${langNameB}
                    
                    TASK:
                    1. Detect the language of the input text.
                    2. Translate it to the OTHER language.
                    
                    CRITICAL RULES:
                    - DO NOT answer questions. (e.g. Input: "How are you?" -> Output: "¿Cómo estás?" NOT "I am fine").
                    - DO NOT explain the translation.
                    - DO NOT add "Translation:" or quotes.
                    - Output ONLY the raw translated text.
                    `;

                    const stream = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userText }
                        ],
                        model: "llama-3.3-70b-versatile", 
                        temperature: 0.0,
                        max_tokens: 500,
                        stream: true
                    });
                    
                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        aiText += content;
                    }

                    aiText = sanitizeAiResponse(aiText);
                    if (!aiText) return;

                    console.log(`🧠 [Traducción]: "${aiText}"`);

                    // 3. GENERACIÓN DE AUDIO (SOLO SI ES VOZ PREMIUM)
                    let audioB64 = null;
                    
                    if (premiumVoiceModel) {
                        // Si el usuario eligió Alloy/Nova, generamos audio con Deepgram Aura
                        try {
                            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${premiumVoiceModel}`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ text: aiText })
                            });
                            
                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                audioB64 = Buffer.from(arrayBuffer).toString('base64');
                            }
                        } catch (err) {
                            console.error("Error generando voz premium:", err.message);
                        }
                    }

                    // 4. RESPUESTA
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        detected_lang: detectedCode, 
                        audio: audioB64 // Será null si es voz estándar, o base64 si es premium
                    }));

                } catch (error) { console.error("❌ Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    const systemPrompt = `
                    You are a STRICT TRANSLATION ENGINE.
                    Context: Languages are ${langNameA} and ${langNameB}.
                    Task: Translate input to the other language.
                    RULES:
                    - DO NOT answer questions.
                    - Output ONLY the raw translation.
                    `;

                    const stream = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: data.text }
                        ],
                        model: "llama-3.3-70b-versatile",
                        stream: true,
                        temperature: 0.0
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        aiText += content;
                    }

                    aiText = sanitizeAiResponse(aiText);
                    
                    // En texto también podemos generar audio si la voz es premium
                    let audioB64 = null;
                    if (premiumVoiceModel && aiText) {
                        try {
                            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${premiumVoiceModel}`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ text: aiText })
                            });
                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                audioB64 = Buffer.from(arrayBuffer).toString('base64');
                            }
                        } catch (err) {}
                    }
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }
        } catch (e) { console.error("WS Error:", e.message); }
    });
});