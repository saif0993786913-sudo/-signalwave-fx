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

    const directionColor = direction === 'BUY' ? '#0FA968' : '#E5384B'
    const directionBg = direction === 'BUY' ? '#E7F8EF' : '#FCEAEC'
    const directionArrow = direction === 'BUY' ? '▲' : '▼'
    const HEADER_IMAGE_URL = 'https://fx.fabletour.com/email-header.png'

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E6E8EB;">

          <!-- HEADER BANNER -->
          <tr>
            <td style="background-color:#FFFFFF;">
              <img src="${HEADER_IMAGE_URL}" width="600" alt="SignalWave FX — 24/7 Market Channel" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:32px 36px 8px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#7C8493;">New Signal Published</p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:26px;font-weight:bold;color:#16181D;padding-right:10px;">${pair}</td>
                  <td>
                    <span style="display:inline-block;background-color:${directionBg};color:${directionColor};font-size:13px;font-weight:bold;padding:5px 12px;border-radius:6px;">${directionArrow} ${direction}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SIGNAL DETAILS TABLE -->
          <tr>
            <td style="padding:16px 36px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EEEFF1;">
                <tr>
                  <td style="padding:14px 0;border-bottom:1px solid #EEEFF1;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:#7C8493;">Entry</td>
                  <td style="padding:14px 0;border-bottom:1px solid #EEEFF1;text-align:right;font-size:15px;font-weight:bold;color:#16181D;">${entry}</td>
                </tr>
                <tr>
                  <td style="padding:14px 0;border-bottom:1px solid #EEEFF1;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:#7C8493;">Stop Loss</td>
                  <td style="padding:14px 0;border-bottom:1px solid #EEEFF1;text-align:right;font-size:15px;font-weight:bold;color:#E5384B;">${stop_loss}</td>
                </tr>
                <tr>
                  <td style="padding:14px 0;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:#7C8493;">Take Profit</td>
                  <td style="padding:14px 0;text-align:right;font-size:15px;font-weight:bold;color:#0FA968;">${take_profit}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${notes ? `
          <!-- NOTES -->
          <tr>
            <td style="padding:8px 36px 8px;">
              <p style="margin:0;font-size:13.5px;line-height:1.6;color:#5B6270;background-color:#F8F9FA;border-radius:8px;padding:14px 16px;">${notes}</p>
            </td>
          </tr>` : ''}

          <!-- CTA BUTTON -->
          <tr>
            <td style="padding:24px 36px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="background-color:#FF3B30;border-radius:8px;">
                    <a href="https://fx.fabletour.com/" style="display:block;padding:14px 0;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">View Live Channel</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SPONSOR BANNER -->
          <tr>
            <td style="padding:0 36px 24px;" align="center">
              <p style="margin:0 0 10px;font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#9AA1AC;text-align:center;">Sponsored</p>
              <a href="https://icmarkets.com/?camp=8117" target="_blank" style="display:inline-block;">
                <img src="https://promo.icmarkets.com/Banners/2021/English/EN_970x250_Cellphon_FSA.jpg" width="528" height="136" alt="IC Markets" style="display:block;width:100%;max-width:528px;height:auto;border:0;border-radius:8px;">
              </a>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:20px 36px 28px;border-top:1px solid #EEEFF1;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#9AA1AC;text-align:center;">
                You're receiving this because you subscribed at fx.fabletour.com.<br>
                Trading carries risk. Signals are provided for informational purposes only and are not financial advice.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
