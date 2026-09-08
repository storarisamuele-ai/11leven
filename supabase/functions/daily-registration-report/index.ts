import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SENDER_EMAIL = 'info@crossfitfarnese.com';
const RECIPIENT_EMAIL = 'info@crossfitfarnese.com';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const REPORT_START = '2026-09-08';
const REPORT_END = '2026-09-12';

function asNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function escapeHtml(value: unknown): string {
    const s = value === null || value === undefined ? '' : String(value);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function romeDateParts(): { year: number; month: number; day: number; dateString: string } {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);

    const [year, month, day] = formatted.split('-').map(Number);
    return { year, month, day, dateString: formatted };
}

function formatItalyDate(date: Date): string {
    return new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(date);
}

async function getAdminClient() {
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

    return createClient(supabaseUrl, adminKey, {
        auth: { persistSession: false },
    });
}

async function sendBrevoEmail(subject: string, htmlContent: string) {
    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) {
        throw new Error('BREVO_API_KEY is not configured on the server.');
    }

    const res = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sender: { name: '11LEVEN', email: SENDER_EMAIL },
            to: [{ email: RECIPIENT_EMAIL }],
            subject,
            htmlContent,
        }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.message || json.error || 'Invio email fallito.');
    }

    return json;
}

function isWithinReportWindow(parts: { year: number; month: number; day: number }): boolean {
    const current = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    return current >= REPORT_START && current <= REPORT_END;
}

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
        const rome = romeDateParts();

        if (!isWithinReportWindow(rome)) {
            return new Response(
                JSON.stringify({
                    ok: false,
                    reason: 'Outside report window (8–12 September 2026, 12:00 CEST).',
                    romeDate: rome.dateString,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        const client = await getAdminClient();

        const { data: registrations, error: registrationsError } = await client
            .from('registrations')
            .select('id, status');
        if (registrationsError) {
            throw new Error(registrationsError.message || 'Impossibile leggere le registrazioni.');
        }

        const registrationList = Array.isArray(registrations) ? registrations : [];
        const confirmedCount = registrationList.filter((r: any) => (r.status || '').toLowerCase() === 'confirmed').length;
        const waitlistCount = registrationList.filter((r: any) => (r.status || '').toLowerCase() === 'waitlist').length;

        const { data: inventory, error: inventoryError } = await client
            .from('shirt_inventory')
            .select('shirt_size, total_quantity, reserved_quantity')
            .order('shirt_size', { ascending: true });
        if (inventoryError) {
            throw new Error(inventoryError.message || 'Impossibile leggere le scorte delle magliette.');
        }

        const inventoryList = Array.isArray(inventory) ? inventory : [];

        const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
        const sortedInventory = inventoryList
            .map((item: any) => {
                const size = String(item.shirt_size ?? '').toUpperCase();
                const total = asNumber(item.total_quantity);
                const reserved = asNumber(item.reserved_quantity);
                const available = Math.max(total - reserved, 0);
                return { size, total, reserved, available };
            })
            .sort((a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size));

        const totalReserved = sortedInventory.reduce((sum, item) => sum + item.reserved, 0);
        const totalAvailable = sortedInventory.reduce((sum, item) => sum + item.available, 0);

        const tableRows = sortedInventory
            .map(
                (item) => `<tr>
    <td style="padding:0.5rem; border-bottom:1px solid #ddd;">${escapeHtml(item.size)}</td>
    <td style="padding:0.5rem; border-bottom:1px solid #ddd;">${item.total}</td>
    <td style="padding:0.5rem; border-bottom:1px solid #ddd;">${item.reserved}</td>
    <td style="padding:0.5rem; border-bottom:1px solid #ddd;">${item.available}</td>
</tr>`,
            )
            .join('\n');

        const reportDate = formatItalyDate(new Date());
        const subject = `11LEVEN — Daily Registration Report — ${reportDate}`;

        const htmlContent = `<!doctype html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #000; padding: 1rem; margin: 0;">
    <h1 style="font-size: 1.5rem; margin: 0 0 0.25rem; text-transform: uppercase;">11LEVEN</h1>
    <h2 style="font-size: 1.1rem; font-weight: normal; margin: 0 0 1.5rem; text-transform: uppercase;">Daily Registration Report</h2>

    <p style="margin: 0 0 1.5rem;">
        <strong>Data e ora dell'aggiornamento:</strong><br>
        ${escapeHtml(reportDate)} — 12:00
    </p>

    <h3 style="margin: 1.5rem 0 0.5rem; font-size: 1rem;">ATLETI</h3>
    <p style="margin: 0 0 1.5rem;">${confirmedCount} atleti prenotati</p>

    <h3 style="margin: 1.5rem 0 0.5rem; font-size: 1rem;">T-SHIRT</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 1rem;">
        <thead>
            <tr style="background: #f2f2f2;">
                <th style="text-align: left; padding: 0.5rem; border-bottom: 2px solid #ddd;">Taglia</th>
                <th style="text-align: left; padding: 0.5rem; border-bottom: 2px solid #ddd;">In magazzino</th>
                <th style="text-align: left; padding: 0.5rem; border-bottom: 2px solid #ddd;">Prenotate</th>
                <th style="text-align: left; padding: 0.5rem; border-bottom: 2px solid #ddd;">Disponibili</th>
            </tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>

    <p style="margin: 0.5rem 0;"><strong>Totale T-shirt prenotate:</strong> ${totalReserved}</p>
    <p style="margin: 0.5rem 0;"><strong>Totale T-shirt disponibili:</strong> ${totalAvailable}</p>

    ${waitlistCount > 0 ? `<p style="margin-top: 1.5rem; color: #555; font-size: 0.85rem;">Atleti in waitlist: ${waitlistCount}</p>` : ''}
</body>
</html>`;

        const brevoResult = await sendBrevoEmail(subject, htmlContent);

        return new Response(
            JSON.stringify({
                ok: true,
                romeDate: reportDate,
                confirmed: confirmedCount,
                waitlist: waitlistCount,
                totalReserved,
                totalAvailable,
                email: brevoResult,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message || 'Errore interno.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
