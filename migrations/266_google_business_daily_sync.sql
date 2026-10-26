-- Daily Google Business Profile sync, run right after the 04:05 Tashkent reports.
--
-- 1. Google review replies move from 13:00 to 04:10 Tashkent (23:10 UTC), in their
--    own job so a review failure can never block the daily reports.
-- 2. New job at 04:20 Tashkent (23:20 UTC) publishes the POS menu to Google Maps
--    (names, descriptions, prices, tourist prices, photos) when it changed.
-- 3. google_menu_photo_keys remembers the Google media key for each POS image URL so
--    a photo is uploaded once. Seeded with the photos published on 2026-10-27.
--
-- Reuses the Vault secret from 152_supabase_daily_report_cron.sql (the Vercel CRON_SECRET).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.google_menu_photo_keys (
  id bigint generated always as identity primary key,
  image_url text not null unique,
  media_key text not null,
  created_at timestamptz not null default now()
);

-- Server-only: the service role bypasses RLS; no client policies.
alter table public.google_menu_photo_keys enable row level security;
revoke all on table public.google_menu_photo_keys from anon, authenticated;

insert into public.google_menu_photo_keys (image_url, media_key) values
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1779036764969-1782194934038-ag0ddb49.png', 'CIABIhBa0gcxC7_TLMMXn6BcNbYo'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1779039662758-1786548585743-9cekqg34.webp', 'CIABIhDdKq5nToFWw1-L7eg_MESg'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1779040812644-1786547779219-u1d5hk3x.webp', 'CIABIhADpjS50pAmY5aJEAj2xpen'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1779094589474-1788531604507-umb5dai8.png', 'CIABIhCPcqZFPEHnzSnwSvz3-XuQ'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1779434003604-1787665620608-4uszqu7v.png', 'CIABIhDXdj3HaMKQghkc86vjU9v2'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780385335358-1792168703833-nny3u9e2.png', 'CIABIhB0sfy8DeGd31pTg1Vnh2OI'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780393353550-1792169078765-v6mbxudx.png', 'CIABIhByVY8kN-xQJnYFgtV8yrPw'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780395842182-1786541103935-dclj6nyp.webp', 'CIABIhBfD41BLbwSIKy71gqAJ2W6'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780399163257-1786016510052-1m51r4db.jpg', 'CIABIhBVMdy9CnXAtlyaIOpcNanl'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780411766263-1782289950994-qoxbdmsu.png', 'CIABIhDjxNSxcIR5N0qSz9FWk163'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780412111537-1782290034396-ecosxz7q.png', 'CIABIhDn-ZgoZ7Ipwl3HOo46MbNs'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780638533152-1790758477764-mdjo17j6.png', 'CIABIhBaVMFYZmahs7hMq-vq-VaG'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780639689683-1786540849343-p25yraxs.webp', 'CIABIhChogQM8zR_7jCdi06CFZji'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780641158794-1790759553776-5zz0nxxu.png', 'CIABIhB4DLvaoOTvm8IVqSXBKdAc'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780642964998-1782193809104-s4w5xewq.png', 'CIABIhBc_LlNPXNHupi8r9Fy6H57'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780643843731-1782194127459-xth67ij6.png', 'CIABIhA86lTV76ZX3gDRmUsu0x5G'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780646280551-1786010940686-56le03ck.jpg', 'CIABIhCdU4HFk5I3aW8han55SUYz'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780677222496-1786547936545-49ozi2p3.webp', 'CIABIhDb266G77MjkAXztcyk6nnt'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780678722762-1782282613036-xjz6e3wz.png', 'CIABIhDrrpZzWytaESKYltxJ01yP'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780684324506-1782290115992-enfm3smn.png', 'CIABIhA_vgFUL966yD9933F--AaM'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780734778866-1782193083633-b9o2nuwg.png', 'CIABIhDH2KDRLbz0U4iAw_O_qXgO'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1780904254807-1786540074672-wirvpzst.webp', 'CIABIhCJjeZcu2id2KIaGMBmT5K4'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781021545650-1786548998344-0u2f5wyd.webp', 'CIABIhCwMKMkcMhVk59UmRgr0y-e'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781022362552-1786549519891-rmd5i1vf.webp', 'CIABIhAFp4jVnTsV_ACpZJM3oYuC'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781091355249-1782290189196-qtfaiypb.png', 'CIABIhDfWgKh_GDlq_qH6gkgz3Bb'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781093443757-1786549500698-cv7t642f.webp', 'CIABIhC0s64itOI04q6zczdGg9EA'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781093532144-1786550581327-tnfexwcq.webp', 'CIABIhDs2hL6KJk00vShS32U8a4m'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781093871849-1786549945633-kld8dloj.webp', 'CIABIhC54QyetZ1JiNuRd7hl5bIY'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781094551763-1786550239346-uyjqqs71.webp', 'CIABIhDhQuI7l937SnOywRxgDH6S'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781094719995-1786549290044-rfsuo30u.webp', 'CIABIhCTx_PDW35LShQWqJaA1t_w'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781094876388-1786549712293-gxhwasxf.webp', 'CIABIhAhKz_Ir1lnXk2W5nooVnlq'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781109036776-1786548870065-qz09tdu0.webp', 'CIABIhDTADOeWvgPlwsX_xFOF9Pn'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781109832390-1786549210544-44djm73s.webp', 'CIABIhA_Pf-KnA5Wp3oBXmf4_NQN'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781112203589-1786550216785-dfme23r6.webp', 'CIABIhB-nHeRzcoQ4C9xz0q3a8in'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781112950018-1786550192927-drfegkz5.webp', 'CIABIhCCgMz9yq256AS5KMd3eFa5'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781174552443-1787587480975-rbgzxwg5.png', 'CIABIhDw-qid2U7ibyMzj2COk1qx'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781183420696-1782291330685-kqtmt737.png', 'CIABIhD0RD_Pywu_IudGyEqL_cUp'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781251954906-1786551209052-rvd91d0v.webp', 'CIABIhBkJEPySORKSs6dyt1ccIYR'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781345818133-1787474948087-mx118o3k.png', 'CIABIhAyuhIpmor2W_7am4IvIPTw'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781345889644-1787475078733-z29ibi1j.png', 'CIABIhCepdHo9_txm3VPSNQ3cdSZ'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781345939712-1786548674735-nn7bf3q6.webp', 'CIABIhA0JHcLQsxG1Uzu12awBNIx'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781508355657-1786691570106-n7o40d65.png', 'CIABIhDDou52PpIK40pFXwmGKTrW'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781511572331-1792169377751-jvvffpbs.png', 'CIABIhDP8JjdAPNkiB1YFyhWdva_'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781511774584-1792169800117-4a70fu0a.png', 'CIABIhCgZ2X7ev7d32MHGFlJCpio'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781512170906-1792169964056-h09lgrm2.png', 'CIABIhAAwl4U9GpeuI3QlkTE-fqt'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781547264124-1786611887097-6aac1v9r.png', 'CIABIhB87W39fT13F6jJrmgrR8Qo'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781547437010-1786550867946-n7jei7j3.webp', 'CIABIhBNDU0-RUKR2O-9_Kgk4h3R'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781547583722-1786551278132-yiifd32i.webp', 'CIABIhBQa7WjHzhMEATvQeDw8Vkh'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781549936703-1786549464182-kxwmykrq.webp', 'CIABIhBwOFYlgxW-EiDwtsNHcKtX'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781921430073-1783950751302-615fft9x.webp', 'CIABIhCgIZj8M392TijNWmpcRfc8'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1781939800333-1787475257441-34zvfimt.png', 'CIABIhBkcaBaMlvYpkBbeaCNCXqc'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782228284663-1782727592704-vsot6f48.png', 'CIABIhBqkIRefM_uZQQ0uz1Ce4ld'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782372544198-1787475582511-8i5vhqh8.png', 'CIABIhBrB18GR_3cKBmKT8kstQ-j'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782373232835-1784707637792-ntwg5aiq.png', 'CIABIhBt8mlTGn2TDHh7DjkMem5Y'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782380337074-1782380758674-isq5snh0.png', 'CIABIhBSHumJOE2cq1Jtik_Q__77'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782381887251-1782382001818-ff2y13so.png', 'CIABIhAirKqtpFyEXFkbedNHwKzt'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782383890290-1787898682302-2lij9tux.png', 'CIABIhCRn5lSfH2NvwqwWHUNkMNu'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782389149074-1782389318668-1mpamlso.png', 'CIABIhAma2AXbojLFSsMRQANhn8q'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1782829439467-1786549798865-l1occkqv.webp', 'CIABIhAqbBes9NuwqgQ-OvPgq3sI'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1783580486819-1786539779204-o54mv187.webp', 'CIABIhAAelneeZvKRTzKFj-FoFtj'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1783606193671-1791009515851-rea7g7jj.png', 'CIABIhAqkBOyJ7FLWe7jVdxlwHMu'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1783858095607-1786539920279-8qp2b4cw.webp', 'CIABIhArrawAp3pN44-7T6kRNbUX'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784037395251-1784620928394-yqaq5cba.png', 'CIABIhBotBmnVqrKcKDKhzLRaqp0'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784057744244-1786610936450-9ryzmey1.png', 'CIABIhASLL_ewOIWzf1nzTOaWcF4'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784779843163-1787201743895-olior53v.png', 'CIABIhAkAFmQe6HMZ0VH4EXpo5Bi'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784780564944-1793014505321-tns17a52.png', 'CIABIhAWc4AHGP4aEhA2QMSn1y3P'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784780809325-1786540322808-qglwgue0.webp', 'CIABIhBwFBF3VAdzNh4ijm2pR2Tc'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784781493917-1786539897236-4ewvmvwm.webp', 'CIABIhBNZxfT8CKaQL9ARIyH9MKN'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784781996312-1784782011244-nobxt7bo.png', 'CIABIhAamyNWL9z7NFz7acHazZ8x'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784782369295-1786540032944-285k00cm.webp', 'CIABIhCYERLYLUhEy1T8eFmv9NNe'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784782809475-1786540202823-2itx2emd.webp', 'CIABIhDaZjXhohVDBVQpFKxiqe9y'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1784875439403-1792129134963-xjt8jetp.png', 'CIABIhAv1U5JAVYYuTPBJ70_43YI'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785399174862-1785400714239-tsiamuwc.png', 'CIABIhCmcChIRcWRikOXLxpDzxSz'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785509024176-1786547807197-e35kt766.webp', 'CIABIhC3w_PPqYV6vuJqr97KrTst'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785756609839-1791828071156-h9k39ont.jpg', 'CIABIhDhIxvTomdUsGM0E1rZtAWy'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785756837117-1786539279161-ok1ncjo7.webp', 'CIABIhBbFkz-SlrSPAkGJ249489G'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785756897075-1791828240494-cmqeqev8.jpg', 'CIABIhBlFBH7ARQ8D80FaezvZLy8'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785828291998-1785850149760-lekjr1oj.png', 'CIABIhAcsq48aw6EyBSf9P_BJkY4'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785831821783-1785852390745-h101b9ea.png', 'CIABIhB4A2uM9FGNCFCz2Ijbgyfo'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785832155579-1791955607238-tc1jajq7.jpg', 'CIABIhC92zXhK5XhCM27130lkxlX'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785832213229-1785853601816-8hjg4y43.png', 'CIABIhB-HqbfmwUEtxH7qomST2z-'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785832252990-1785853841734-ntgyclvy.png', 'CIABIhAg4pxRThfoifTMW8XwpKfC'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785832288791-1785855597860-8hkei5iy.png', 'CIABIhCjEJ2t8V5rhwdx6YLewOtI'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785853567550-1787472234720-kdzagsfr.png', 'CIABIhDa-JHpI2meeSfWeIvRVgpx'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1785853723033-1790270995038-76o601ym.png', 'CIABIhCXwZ0wKCqVewhcY0KQl57q'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1786516531928-1792170380575-95kkp09f.png', 'CIABIhAARCAdCvCHqH5F_5UrloCB'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1786549344044-1786549362277-kov8gd9e.webp', 'CIABIhD-T68OyR9rOUClDQL6RQKW'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1786695051870-1786696795198-q1ttlk9i.png', 'CIABIhCvkmc__6xu8iiAEvcscvY1'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1786777446706-1786777470366-52cdfd25.webp', 'CIABIhA83IKDRUdFmuQsHpH-tppU'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1786982803564-1786982921094-xfgrec3j.webp', 'CIABIhA2tFoiRY4R_pAFoJjls9Y5'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787034578692-1787661996257-jxgc8a5h.png', 'CIABIhD-XIoPxDzC0g_XHDWHObZr'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787035908418-1788345129369-d3z19yie.png', 'CIABIhDRXNxguk-JHvwxZ7hkBObI'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787060632414-1788194694481-9dpgtu78.png', 'CIABIhDZBAth1JSRaSRMOpMWowBo'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787153682046-1787664351554-e0asncob.png', 'CIABIhBOaQRuBJyj4kP-r1qzs9_Z'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787201461035-1787201531312-ba8b4tw9.png', 'CIABIhCJi_kWQKsmq6wjDSy1mvQS'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787208672252-1787208994647-pgi7h669.png', 'CIABIhD7nGSLYtsB-DUHnfrLpvr7'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787209033224-1787209331635-fjnx5c8w.png', 'CIABIhCEDZjU2XUyUX8liGjNMl5W'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787230854048-1787231199848-rar0faf0.png', 'CIABIhCmaNI4XHY-2yW7zfF6Orxe'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787471758083-1787849162935-64rcvw17.png', 'CIABIhBSZvmjMEpPw0K6ROV-40Hc'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787496889191-1788196571873-rjcxkcl3.png', 'CIABIhAjRg8ffnH5Ro6XCiOYed1o'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1787757681085-1788196831510-o38z3tdg.png', 'CIABIhC22oH7EXtMNGm9CvWVg3vA'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1788071541521-1788345438206-lu5hrkbi.png', 'CIABIhBz53Wagykl16k39wIs6qxh'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1788960170414-1791827211596-klgbq70k.jpg', 'CIABIhBUiFmjn3WLKtV85ENk957Q'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1789887946305-1789890114518-xgxo6jh0.png', 'CIABIhDAwZ8KyT6UWcKI-Mvpwxba'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1789890377936-1789890512583-quqxk9h7.png', 'CIABIhAmDbM7SPg8njWioKBqbq02'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1789890930069-1793015221857-zq3cj3rt.png', 'CIABIhBTL4Kt1-mJFsYkwhcrad3Z'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1789891102596-1789913349652-r9b7jmfq.png', 'CIABIhBrT_ZnwlGruOxVbTWCKAhw'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1790087359898-1790272412796-2c95j5tk.png', 'CIABIhAoGO5ayf_6_pjq6z8MwURS'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791448774702-1791827328878-i0yel7q9.jpg', 'CIABIhA_Z2fXEOI02oWGiqzO2CBC'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791654445779-1791827663514-5e9p7n71.jpg', 'CIABIhBFIxUiWDXOFNsn_xSYqqa9'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791707593463-1791827509195-kf0f38pq.jpg', 'CIABIhBT9ge4VTM4MNC8O1eqZGzi'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791824249667-1791824362336-4npbhgxh.jpg', 'CIABIhAdg6rruWaqMA_68BP_hP7j'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791825018351-1791825156313-31t4gr2b.jpg', 'CIABIhD2h4EmX-n3a5sJa77utKPo'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791825226422-1791825312052-oeo9m67o.jpg', 'CIABIhDKJExBsosTOddQBESzmpdH'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791828377891-1791828433676-8ogmp0ll.jpg', 'CIABIhD5t9o_ovhJT0Wnna2YAWAu'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1791828604256-1791828652159-qc55who1.jpg', 'CIABIhA8r-gNSfswuLvtDO3FaGHc'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792128726626-1792128815657-fn8w3kf0.png', 'CIABIhDPIChsM-Nqc5dXxCYTHrdw'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792130271587-1792130319503-ydgrky6y.png', 'CIABIhDWOXUxQfmQsODENXeFExRp'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792142864629-1792143712155-kgd9k95t.jpg', 'CIABIhBrFra0rg5196lJhwpokTtO'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792143860117-1792144023295-armal3lu.jpg', 'CIABIhChRV6K2pXBRcMxvG3fxuJF'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792158775697-1792158819572-1werv413.png', 'CIABIhA7fVaDcGWe1a2oONnYis6v'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792158887348-1792159440000-b04nkg5c.png', 'CIABIhBdA0cjSgoKimIuBAQl3wyZ'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792159707526-1792159737697-ldej50i2.png', 'CIABIhCHEvtPplXpPr7DG98BgNOb'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792159887490-1792159961557-81bb2obr.png', 'CIABIhBmvTw2BFofdzZbcq9M-Ujo'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792162591680-1792162668901-66dp3mk7.png', 'CIABIhATzaEIHHJBLNHY0WgxI9Lf'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792163092442-1792163131386-ayor4uv9.png', 'CIABIhCZGxucQa6m70YwkYxE8oF-'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792167135674-1792167269642-rhh5fn1l.png', 'CIABIhA4IqtbCj8kLUsEoV1va6Jm'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792846925008-1792847134857-c0g7qrn3.png', 'CIABIhBNiTL3Ds_kKFr3OZiyffzq'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1792926042468-1792926126149-ssp5o7wa.png', 'CIABIhBS2Az6eAD8zbzfAXVU5FIv'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1793023303135-1793023400759-bamkotyw.png', 'CIABIhC9WqEefvV3JZ5wJXMqGKjo'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1793023575646-1793023695734-xxo6130o.png', 'CIABIhCboRQkfq5gv33438lTl-WW'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1793029163842-1793029426965-4zj31dai.png', 'CIABIhDjYmoSHNbAG-0Ku5ZOKjYp'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/m11-1792170090839-z1dhb7v8.png', 'CIABIhA_S_0uvPsYryLwv-bhrtWI'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/m3-1786540954813-jklkh093.webp', 'CIABIhBW1E2pB6sX4N2sMx-bkDno'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/m9-1790759431076-b3eokcy7.png', 'CIABIhBEPWC9V0KPUpDCDNTmFfKB'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_ayran-1782193394805-z8p41exk.png', 'CIABIhAxNxzTxDvToRsYj-byK1bv'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_cottage_cheese_crepes-1786539111333-5jpi8hk3.webp', 'CIABIhC8uJN-9g3B9a0P_tz_PVfp'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_english_breakfast-1791827878363-dbrmo7d9.jpg', 'CIABIhD7pk3-UTNmWP4nwwj1mDXp'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_fries-1782194698836-wy7qjxwj.png', 'CIABIhAPm5eBYipY4Clfym28-v6y'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_garden_salad-1792167557509-85zabv66.png', 'CIABIhA4VgnCX-K1-07ByAlzL2LU'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_honey_cake-1781341641639-leylvhag.webp', 'CIABIhAGjDyKmg2X4cmFoaJUendy'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_lamb_ribs-1786016403265-i4ij4lbr.jpg', 'CIABIhCHPSuloMCoC4CdeCgq3dS3'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_mastava-1787663732561-abegiuf7.png', 'CIABIhDm-xNWTJziq0sGdmmfCgei'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_shakshuka-1791828163589-nscod555.jpg', 'CIABIhDwPb5JBj1ApVCDl__kgrZ_'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_shorva-1786547918104-avmlunba.webp', 'CIABIhD53wi6Odsg7VF3f9UsWziA'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_suzma_salad-1782210367255-wdnjm9ta.png', 'CIABIhDjQ3qgJiQktmKWfgYL7291'),
  ('https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_syrniki-1791827959936-qnhl9kfr.jpg', 'CIABIhBrncJf828JBZnSG-H87W2K')
on conflict (image_url) do nothing;

create or replace function public.invoke_zar_kebab_google_menu_sync()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into cron_secret
  from vault.decrypted_secrets
  where name = 'zar_kebab_daily_report_cron_secret'
  order by created_at desc
  limit 1;

  if nullif(btrim(cron_secret), '') is null then
    raise exception 'Missing Vault secret: zar_kebab_daily_report_cron_secret';
  end if;

  select net.http_get(
    url := 'https://www.zarkebab.uz/api/google-reviews/run?task=menu',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Accept', 'application/json',
      'User-Agent', 'Zar-Kebab-Supabase-Cron/1.0'
    ),
    timeout_milliseconds := 300000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_zar_kebab_google_menu_sync() from public;
revoke all on function public.invoke_zar_kebab_google_menu_sync() from anon;
revoke all on function public.invoke_zar_kebab_google_menu_sync() from authenticated;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname in ('zar-kebab-google-review-replies', 'zar-kebab-google-menu-sync')
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'zar-kebab-google-review-replies',
    '10 23 * * *',
    'select public.invoke_zar_kebab_google_review_replies();'
  );

  perform cron.schedule(
    'zar-kebab-google-menu-sync',
    '20 23 * * *',
    'select public.invoke_zar_kebab_google_menu_sync();'
  );
end;
$$;
