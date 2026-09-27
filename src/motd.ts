const greeting = 'this is thermalprint http';
const randomMotds = [
  'receipts printed. trees mildly concerned.',
  'we print, you tear.',
  'paper jam? not on our watch.',
  'no ink required. ever.',
  'thermal paper: fading since the day it was printed.',
  'keep your receipt. or do not. we do not judge.',
  'the cutter is sharp. so is the api.',
  'ESC @ and good vibes.',
  'printing at the speed of heat.',
  'would you like your receipt? we already printed it.',
  'the paper roll is running low. it always is.',
  'one job at a time. no interleaving, no drama.',
  'the cash drawer opens on command. not on request.',
  'QR codes: the only thing people scan on receipts.',
  'your receipt is 3 meters long. you are welcome.',
  'bold text for totals. underline for regret.',
  'printed on 80mm of pure confidence.',
  'code page 858, because the euro sign matters.',
  'we speak fluent ESC/POS.',
  'the printer beeped. someone look at it.',
  'hot off the press. literally.',
  'paperless office? not here.',
  'powered by coca-cola and a thermal head.',
  'the tm-t20ii has seen things.',
  'receipt printed. customer already gone.',
  'upside down text: for the chaotic ones.',
  'tear here. carefully. ugh, crooked again.',
  'barcodes, but make them physical.',
  'from json to paper in milliseconds.',
  'ready to print!',
  'let the printing begin!',
  'please do not lick the thermal paper.',
  'every byte a dot, every dot a masterpiece.',
  'the last print service you will ever need.',
  'sent to /dev/usb/lp0 with love.',
];

export function getHello(ip: string | undefined, version: string) {
  const cleanIp = ip?.replace(/^::ffff:/, '');
  return {
    message: cleanIp ? `Hi ${cleanIp}, ${greeting}` : greeting,
    writtenBy: ['Marc Rufeis'],
    version,
    motd: randomMotds[Math.floor(Math.random() * randomMotds.length)],
  };
}
