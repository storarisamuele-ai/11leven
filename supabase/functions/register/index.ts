import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const { captcha_token, ...payload } = await req.json();

        // Server-side CAPTCHA verification.
        const captchaSecret = Deno.env.get('CAPTCHA_SECRET');
        if (!captchaSecret) {
            throw new Error('CAPTCHA_SECRET is not configured on the server.');
        }
        if (!captcha_token) {
            throw new Error('Completa la verifica prima di continuare.');
        }

        const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
        const body = new URLSearchParams();
        body.append('secret', captchaSecret);
        body.append('response', captcha_token);

        const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip');
        if (forwarded) {
            body.append('remoteip', forwarded);
        }

        const captchaRes = await fetch(verifyUrl, {
            method: 'POST',
            body,
        });

        const captchaData = await captchaRes.json();

        if (!captchaData.success) {
            throw new Error('Verifica CAPTCHA fallita. Riprova.');
        }

        // Call the existing registration RPC with the Supabase admin key.
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');

        if (!supabaseUrl) {
            throw new Error('SUPABASE_URL is not configured on the server.');
        }

        if (!secretKeysRaw) {
            throw new Error('SUPABASE_SECRET_KEYS is not configured on the server.');
        }

        let secretKeys: Record<string, string>;
        try {
            secretKeys = JSON.parse(secretKeysRaw);
        } catch {
            throw new Error('SUPABASE_SECRET_KEYS is not valid JSON.');
        }

        const adminKey = secretKeys['default'];

        if (!adminKey) {
            throw new Error("SUPABASE_SECRET_KEYS does not contain a 'default' key.");
        }

        const adminClient = createClient(supabaseUrl, adminKey, {
            auth: { persistSession: false },
        });

        const { data, error } = await adminClient.rpc('register_for_11leven', {
            p_first_name: payload.first_name,
            p_last_name: payload.last_name,
            p_email: payload.email,
            p_shirt_size: payload.shirt_size,
            p_participant_type: payload.participant_type,
            p_privacy_consent: payload.privacy_consent,
            p_participation_consent: payload.participation_consent,
            p_marketing_consent: payload.marketing_consent,
        });

        if (error) {
            throw new Error(error.message || 'Registrazione fallita.');
        }

        return new Response(JSON.stringify({ data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
