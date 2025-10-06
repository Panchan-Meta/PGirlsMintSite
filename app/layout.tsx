// app/layout.tsx
import Script from "next/script";

export const metadata = {
  title: "Rahab Punkaholic Girls",
  description: "PGirls NFT Minting Site",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body
        style={{ margin: 0, padding: 0, backgroundColor: "black", color: "white" }}
      >
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-66GTK7C6VR"
        />
        <Script id="ga4-config" strategy="afterInteractive">
          {`
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());

  gtag('config', 'G-66GTK7C6VR', {
    send_page_view: true,
    linker: {
      domains: [
        'rahabpunkaholicgirls.com',
        'www.rahabpunkaholicgirls.com',
        'mint.rahabpunkaholicgirls.com',
        'blgtoken.rahabpunkaholicgirls.com'
      ]
    }
  });
        `}
        </Script>
        <Script id="ga4-click-tracking" strategy="afterInteractive">
          {`
  document.addEventListener('click', function(e){
    var el=e.target.closest('a,button'); if(!el) return;
    var href=(el.tagName==='A')?el.href:'';
    var isOut=(el.tagName==='A') && href && (new URL(href,location.href)).host!==location.host;
    var label=el.getAttribute('data-ga-label') || (el.textContent||'').trim().slice(0,64) || href;
    gtag('event', isOut?'click_outbound':'click', {
      event_category:'engagement',
      event_label:label,
      section_id: el.closest('section')?.id || 'global',
      link_url: href || ''
    });
  }, {capture:true});
        `}
        </Script>
        {children}
      </body>
    </html>
  );
}
