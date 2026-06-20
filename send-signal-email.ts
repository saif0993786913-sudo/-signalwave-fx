// supabase/functions/send-signal-email/index.ts
//
// Deploy this with the Supabase CLI:
//   supabase functions deploy send-signal-email
//
// Before deploying, set your Resend API key as a secret (never put it
// directly in this file, since this code can be publicly visible):
//   supabase secrets set RESEND_API_KEY=your_actual_key_here
//
// This function:
//   1. Receives signal details from the database trigger (see EMAIL_SETUP.sql)
//   2. Fetches every subscriber email from the subscribers table
//   3. Sends each of them an email via Resend with the signal details

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const FROM_EMAIL = 'SignalWave FX <fx@fabletour.com>'

Deno.serve(async (req) => {
  try {
    const signal = await req.json()
    const { pair, direction, entry, stop_loss, take_profit, notes } = signal

    if (!pair || !direction || entry === undefined) {
      return new Response(JSON.stringify({ error: 'Missing signal fields' }), { status: 400 })
    }

    // Use the service role key here (server-side only, never exposed to browsers)
    // so we can read the full subscriber list regardless of RLS policies.
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const { data: subscribers, error: subError } = await supabase
      .from('subscribers')
      .select('email')

    if (subError) {
      return new Response(JSON.stringify({ error: subError.message }), { status: 500 })
    }
    if (!subscribers || subscribers.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscribers, nothing sent' }), { status: 200 })
    }

    const directionColor = direction === 'BUY' ? '#00D964' : '#FF3B5C'
    const directionArrow = direction === 'BUY' ? '▲' : '▼'

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0A0E14;color:#E8ECF1;padding:28px;border-radius:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <div style="width:34px;height:34px;border-radius:8px;background:#FF3B30;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;">SW</div>
          <span style="font-size:15px;font-weight:bold;">SignalWave FX</span>
        </div>
        <h2 style="margin:0 0 4px;font-size:22px;">${pair} <span style="color:${directionColor};font-size:16px;">${directionArrow} ${direction}</span></h2>
        <p style="color:#8B95A7;font-size:13px;margin:0 0 20px;">New signal just published</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #1E2733;color:#8B95A7;font-size:12px;text-transform:uppercase;">Entry</td>
            <td style="padding:10px 0;border-bottom:1px solid #1E2733;text-align:right;font-weight:bold;">${entry}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #1E2733;color:#8B95A7;font-size:12px;text-transform:uppercase;">Stop Loss</td>
            <td style="padding:10px 0;border-bottom:1px solid #1E2733;text-align:right;font-weight:bold;color:#FF3B5C;">${stop_loss}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8B95A7;font-size:12px;text-transform:uppercase;">Take Profit</td>
            <td style="padding:10px 0;text-align:right;font-weight:bold;color:#00D964;">${take_profit}</td>
          </tr>
        </table>
        ${notes ? `<p style="color:#8B95A7;font-size:13px;line-height:1.5;margin-bottom:20px;">${notes}</p>` : ''}
        <a href="https://fx.fabletour.com/" style="display:block;text-align:center;background:#FF3B30;color:#fff;padding:12px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:14px;">View live channel</a>
        <p style="color:#566073;font-size:10px;margin-top:20px;text-align:center;">You're receiving this because you subscribed at fx.fabletour.com. Trading carries risk; this is not financial advice.</p>
      </div>
    `

    // Resend free tier doesn't support true bulk-send to many distinct
    // recipients in one call reliably, so we send individually. For larger
    // subscriber counts later, batch these or use Resend's batch endpoint.
    const results = await Promise.allSettled(
      subscribers.map((sub: { email: string }) =>
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: sub.email,
            subject: `${directionArrow} ${direction} ${pair} — New Signal`,
            html: emailHtml,
          }),
        })
      )
    )

    const failed = results.filter(r => r.status === 'rejected').length

    return new Response(
      JSON.stringify({ sent: subscribers.length - failed, failed }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
