# Map listing kit: Google Business Profile + Yandex Business

Facts from `docs/business-profile.md` (hours: daily 08:00–23:30).
No prices in descriptions (they change). Replies follow the house rule: answer in the
reviewer's language, always say "Zar Kebab", never name staff ("the Zar Kebab team").

## 1. Descriptions

### Google (≤ 750 characters)

**ru**
> Zar Kebab — халяль ресторан узбекской, уйгурской и турецкой кухни в Ташкенте, на улице Матбуотчилар, 17. Готовим шашлык и кебаб на мангале из говядины, баранины и курицы, плов, манты, чучвару, уйгурский и жареный лагман, казан-кебаб, сай, курутоб и олотскую самсу. С 8:00 до 11:00 — завтраки: сырники, шакшука, английский завтрак. Днём — бизнес-ланч, для компаний — корпоративные сеты и кейтеринг. Есть летняя веранда и детское меню, принимаем бронирование столов. Меню на сайте zarkebab.uz на русском, узбекском и английском.

**uz**
> Zar Kebab — Toshkentdagi halol restoran, Matbuotchilar ko‘chasi, 17. O‘zbek, uyg‘ur va turk taomlari: mangalda pishirilgan mol, qo‘y va tovuq go‘shtidan shashlik va kabob, osh, manti, chuchvara, uyg‘ur va qovurma lag‘mon, qozon kabob, say, qurutob va Olot somsa. 8:00 dan 11:00 gacha nonushta: sirniki, shakshuka, ingliz nonushtasi. Kunduzi biznes-lanch, kompaniyalar uchun korporativ setlar va keytering. Yozgi ayvon va bolalar menyusi bor, stol band qilish mumkin. Menyu zarkebab.uz saytida o‘zbek, rus va ingliz tillarida.

**en**
> Zar Kebab is a halal restaurant serving Uzbek, Uyghur and Turkish food at 17 Matbuotchilar Street, Tashkent. We grill beef, lamb and chicken shashlik and kebab over charcoal and cook plov, manti and chuchvara dumplings, Uyghur and fried lagman, kazan kebab, say, qurutob and Olot samsa. Breakfast runs 8:00–11:00: syrniki, shakshuka and a full English breakfast. Business lunch at midday, plus corporate sets and catering for teams. Summer terrace, children's menu and table reservations. Full menu in English, Russian and Uzbek at zarkebab.uz.

### Yandex (≤ 3000 characters; the first 200 carry the key facts)

**ru**
> Халяль ресторан Zar Kebab в Ташкенте, Матбуотчилар, 17: шашлык на мангале, плов, манты, чучвара, лагман и казан-кебаб. Узбекская, уйгурская и турецкая кухня, завтраки с 8:00.
>
> Шашлык готовим на углях: из говядины, баранины, корейки, куриного филе, крылышек, молотый, рулет-шашлык и «Наполеон», есть овощной шашлык и большие шашлычные ассорти для компании.
>
> Горячие блюда: свадебный плов (и плов на вынос, 1 кг), манты, чучвара, уйгурский и жареный лагман, казан-кебаб, сай с говядиной или курицей, курутоб, долма, говяжий кофте, олотская самса. Супы: мастава, кайнатма шурпа, суп с тефтелями, чечевичный, окрошка.
>
> Завтраки с 8:00 до 11:00: сырники, шакшука, английский завтрак, блинчики, каши, омлет.
>
> Для компаний: корпоративные сеты, кейтеринг и обеды в офис; есть замороженные полуфабрикаты домой.
>
> Летняя веранда, детское меню, бронирование столов по телефону +998 91 509 55 45. Оплата наличными, картой или по QR-коду. Меню с фото на русском, узбекском и английском — zarkebab.uz.

(Use the uz/en Google texts above for the other Yandex languages.)

## 2. Categories

Pick from the platform's own list; names below exist on both today.

- **Google** — primary: *Uzbek restaurant*. Secondary: *Kebab shop*, *Halal restaurant*, *Breakfast restaurant*, and *Uyghur restaurant* or *Central Asian restaurant* if the category picker offers it (type the name; use only exact matches).
- **Yandex** — primary: *Ресторан*. Secondary: *Кафе*, *Шашлычная*, *Банкетный зал* only if you host banquets (TODO confirm), *Доставка еды и обедов* only if you deliver yourselves (TODO confirm). Cuisine field: узбекская, уйгурская, турецкая, среднеазиатская, халяль.

## 3. Services, menu and attributes

- Menu: Yandex already reads the regular-price list (uploaded file). Google menu: kept by the review/menu sync (`api/google-reviews/`).
- Services to list: dine-in, takeaway, table reservations, business lunch, corporate sets, catering, frozen half-prepared meals.
- Attributes to keep set: halal, summer terrace, children's menu, reservations, card/QR payment, breakfast 08:00–11:00.
- Leave unset unless true: karaoke, dance floor, kids' room, gift certificates (the Yandex notes flag these as suspicious).

## 4. Photo checklist

| What | Google | Yandex |
| --- | --- | --- |
| Exterior with the Zar Kebab sign, day and evening | ≥ 720×720, JPG/PNG, < 5 MB | ≥ 1000 px wide |
| Interior: main hall, terrace | same | same |
| Dishes: shashlik, plov, manti, chuchvara, lagman, kazan kebab, breakfast | 3–5 per dish group | "Еда" album |
| Team at work (no names on captions) | | |
| Logo | 250×250 to 5000×5000 square | square |
| Cover | 1024×576 (16:9) | 1920×1080 |

Real photos only, no stock images, no text overlays on the cover. Add one new photo a week.

## 5. Review replies

Replace `{name}` and `{detail}` (something the guest actually mentioned). Reply in their language.

**5★ (ru)**
> {name}, спасибо за тёплый отзыв! Очень рады, что вам понравился {detail}. Ждём вас снова в Zar Kebab.

**5★ (en)**
> Thank you, {name}! We're glad you enjoyed the {detail}. See you again at Zar Kebab.

**3–4★ (ru)**
> {name}, спасибо, что поделились. Рады, что {detail} понравился, а замечание про {detail} передали команде Zar Kebab и уже разбираем. Будем рады показать, что стало лучше.

**3–4★ (en)**
> Thanks for the honest review, {name}. Glad you liked the {detail}; we've shared your note about {detail} with the Zar Kebab team and are working on it. We'd love to have you back.

**1–2★ (ru)**
> {name}, извините, что визит в Zar Kebab прошёл так. {detail} — это не наш уровень. Мы уже {specific fix}. Пожалуйста, напишите нам в Telegram t.me/zarkebab или позвоните +998 91 509 55 45 — хотим разобраться лично.

**1–2★ (en)**
> {name}, we're sorry your visit to Zar Kebab went this way. {detail} is not our standard, and we have already {specific fix}. Please message us on Telegram (t.me/zarkebab) or call +998 91 509 55 45 so we can make it right.

**Factually wrong review (ru)**
> {name}, спасибо за отзыв. Хотим уточнить: {correct fact, e.g. в Zar Kebab к счёту добавляется обслуживание 15%, это указано в меню}. Если мы что-то упустили, напишите нам в Telegram t.me/zarkebab — разберёмся.

**Factually wrong review (en)**
> Thanks for the feedback, {name}. To clarify: {correct fact}. If we've missed something, please message Zar Kebab on Telegram (t.me/zarkebab) and we'll look into it.

## 6. Review request (every guest, same message)

Ask everyone, not only happy guests. No discounts or gifts for reviews.

**Telegram / receipt text (ru)**
> Спасибо, что выбрали Zar Kebab! Нам важно ваше честное мнение — оставьте отзыв:
> Google: {GOOGLE_REVIEW_URL} · Яндекс: {YANDEX_REVIEW_URL}

**uz**
> Zar Kebab’ni tanlaganingiz uchun rahmat! Halol fikringizni qoldiring:
> Google: {GOOGLE_REVIEW_URL} · Yandex: {YANDEX_REVIEW_URL}

**en**
> Thank you for choosing Zar Kebab! Tell us honestly how it went:
> Google: {GOOGLE_REVIEW_URL} · Yandex: {YANDEX_REVIEW_URL}

**Printed table card (QR)**
> Как вам Zar Kebab? · Zar Kebab sizga yoqdimi? · How was Zar Kebab?
> [QR → Google] [QR → Яндекс]
> Ваш честный отзыв помогает нам стать лучше.

`{GOOGLE_REVIEW_URL}`: Google Business Profile → Ask for reviews → copy link (TODO).
`{YANDEX_REVIEW_URL}`: Yandex Business → Отзывы → «Получить ссылку на отзыв» (TODO).

## 7. Weekly routine

- Monday: one post on Google and Yandex (dish of the week with a real photo).
- Every day: answer new reviews within 48 hours (the Google bot covers Google once enabled; Yandex is manual).
- Before each holiday: set special hours on both maps.
- Monthly: check name, address, phone and hours match on the site, Google, Yandex, 2GIS, Instagram and Telegram.
- After menu changes: deploy the site (refreshes the crawler pages and sitemap) and check the Yandex price list.
