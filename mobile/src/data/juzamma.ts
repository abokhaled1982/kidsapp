// Juz 'Amma (Juz 30) - ausgewaehlte, meistgelernte kurze Suren.
// Text: Hafs 'an 'Asim, mit Tashkeel (das Backend entfernt sie via strip_diacritics).
// Wortweise gesplittet: das Modell arbeitet am zuverlaessigsten auf Einzelwoertern.
// Restliche 18 laengere Suren koennen inkrementell ergaenzt werden.

export type QuranWord = { ar: string; translit?: string };
export type QuranAyah = { n: number; words: QuranWord[] };
export type Surah = {
  n: number;
  name_ar: string;
  name_de: string;
  translit: string;
  ayat: QuranAyah[];
};

const w = (ar: string, translit?: string): QuranWord => ({ ar, translit });

// Hilfsfunktion: Basmala als erste Ayah (bei allen Suren ausser at-Tawba - hier alle Juz-Amma-Suren)
const BASMALA: QuranWord[] = [
  w("بِسْمِ", "bismi"),
  w("اللَّهِ", "llāhi"),
  w("الرَّحْمَٰنِ", "r-raḥmāni"),
  w("الرَّحِيمِ", "r-raḥīm"),
];

export const SURAHS: Surah[] = [
  {
    n: 114, name_ar: "النَّاس", name_de: "Die Menschen", translit: "An-Nās",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("قُلْ", "qul"), w("أَعُوذُ", "aʿūḏu"), w("بِرَبِّ", "birabbi"), w("النَّاسِ", "n-nās")] },
      { n: 2, words: [w("مَلِكِ", "maliki"), w("النَّاسِ", "n-nās")] },
      { n: 3, words: [w("إِلَٰهِ", "ilāhi"), w("النَّاسِ", "n-nās")] },
      { n: 4, words: [w("مِنْ", "min"), w("شَرِّ", "šarri"), w("الْوَسْوَاسِ", "l-waswāsi"), w("الْخَنَّاسِ", "l-ḵannās")] },
      { n: 5, words: [w("الَّذِي", "allaḏī"), w("يُوَسْوِسُ", "yuwaswisu"), w("فِي", "fī"), w("صُدُورِ", "ṣudūri"), w("النَّاسِ", "n-nās")] },
      { n: 6, words: [w("مِنَ", "mina"), w("الْجِنَّةِ", "l-jinnati"), w("وَالنَّاسِ", "wa-n-nās")] },
    ],
  },
  {
    n: 113, name_ar: "الْفَلَق", name_de: "Der Tagesanbruch", translit: "Al-Falaq",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("قُلْ", "qul"), w("أَعُوذُ", "aʿūḏu"), w("بِرَبِّ", "birabbi"), w("الْفَلَقِ", "l-falaq")] },
      { n: 2, words: [w("مِنْ", "min"), w("شَرِّ", "šarri"), w("مَا", "mā"), w("خَلَقَ", "ḵalaq")] },
      { n: 3, words: [w("وَمِنْ", "wa-min"), w("شَرِّ", "šarri"), w("غَاسِقٍ", "ġāsiqin"), w("إِذَا", "iḏā"), w("وَقَبَ", "waqab")] },
      { n: 4, words: [w("وَمِنْ", "wa-min"), w("شَرِّ", "šarri"), w("النَّفَّاثَاتِ", "n-naffāṯāti"), w("فِي", "fī"), w("الْعُقَدِ", "l-ʿuqad")] },
      { n: 5, words: [w("وَمِنْ", "wa-min"), w("شَرِّ", "šarri"), w("حَاسِدٍ", "ḥāsidin"), w("إِذَا", "iḏā"), w("حَسَدَ", "ḥasad")] },
    ],
  },
  {
    n: 112, name_ar: "الْإِخْلَاص", name_de: "Die Aufrichtigkeit", translit: "Al-Ikhlāṣ",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("قُلْ", "qul"), w("هُوَ", "huwa"), w("اللَّهُ", "llāhu"), w("أَحَدٌ", "aḥad")] },
      { n: 2, words: [w("اللَّهُ", "llāhu"), w("الصَّمَدُ", "ṣ-ṣamad")] },
      { n: 3, words: [w("لَمْ", "lam"), w("يَلِدْ", "yalid"), w("وَلَمْ", "wa-lam"), w("يُولَدْ", "yūlad")] },
      { n: 4, words: [w("وَلَمْ", "wa-lam"), w("يَكُن", "yakun"), w("لَّهُ", "lahu"), w("كُفُوًا", "kufuwan"), w("أَحَدٌ", "aḥad")] },
    ],
  },
  {
    n: 111, name_ar: "الْمَسَد", name_de: "Die Palmfasern", translit: "Al-Masad",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("تَبَّتْ", "tabbat"), w("يَدَا", "yadā"), w("أَبِي", "abī"), w("لَهَبٍ", "lahabin"), w("وَتَبَّ", "wa-tabb")] },
      { n: 2, words: [w("مَا", "mā"), w("أَغْنَىٰ", "aġnā"), w("عَنْهُ", "ʿanhu"), w("مَالُهُ", "māluhu"), w("وَمَا", "wa-mā"), w("كَسَبَ", "kasab")] },
      { n: 3, words: [w("سَيَصْلَىٰ", "sayaṣlā"), w("نَارًا", "nāran"), w("ذَاتَ", "ḏāta"), w("لَهَبٍ", "lahab")] },
      { n: 4, words: [w("وَامْرَأَتُهُ", "wa-mraʾatuhu"), w("حَمَّالَةَ", "ḥammālata"), w("الْحَطَبِ", "l-ḥaṭab")] },
      { n: 5, words: [w("فِي", "fī"), w("جِيدِهَا", "jīdihā"), w("حَبْلٌ", "ḥablun"), w("مِّن", "min"), w("مَّسَدٍ", "masad")] },
    ],
  },
  {
    n: 110, name_ar: "النَّصْر", name_de: "Die Hilfe", translit: "An-Naṣr",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("إِذَا", "iḏā"), w("جَاءَ", "jāʾa"), w("نَصْرُ", "naṣru"), w("اللَّهِ", "llāhi"), w("وَالْفَتْحُ", "wa-l-fatḥ")] },
      { n: 2, words: [w("وَرَأَيْتَ", "wa-raʾayta"), w("النَّاسَ", "n-nāsa"), w("يَدْخُلُونَ", "yadḵulūna"), w("فِي", "fī"), w("دِينِ", "dīni"), w("اللَّهِ", "llāhi"), w("أَفْوَاجًا", "afwājā")] },
      { n: 3, words: [w("فَسَبِّحْ", "fa-sabbiḥ"), w("بِحَمْدِ", "biḥamdi"), w("رَبِّكَ", "rabbika"), w("وَاسْتَغْفِرْهُ", "wa-staġfirhu"), w("إِنَّهُ", "innahu"), w("كَانَ", "kāna"), w("تَوَّابًا", "tawwābā")] },
    ],
  },
  {
    n: 109, name_ar: "الْكَافِرُون", name_de: "Die Unglaeubigen", translit: "Al-Kāfirūn",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("قُلْ", "qul"), w("يَا", "yā"), w("أَيُّهَا", "ayyuhā"), w("الْكَافِرُونَ", "l-kāfirūn")] },
      { n: 2, words: [w("لَا", "lā"), w("أَعْبُدُ", "aʿbudu"), w("مَا", "mā"), w("تَعْبُدُونَ", "taʿbudūn")] },
      { n: 3, words: [w("وَلَا", "wa-lā"), w("أَنتُمْ", "antum"), w("عَابِدُونَ", "ʿābidūna"), w("مَا", "mā"), w("أَعْبُدُ", "aʿbud")] },
      { n: 4, words: [w("وَلَا", "wa-lā"), w("أَنَا", "anā"), w("عَابِدٌ", "ʿābidun"), w("مَّا", "mā"), w("عَبَدتُّمْ", "ʿabadtum")] },
      { n: 5, words: [w("وَلَا", "wa-lā"), w("أَنتُمْ", "antum"), w("عَابِدُونَ", "ʿābidūna"), w("مَا", "mā"), w("أَعْبُدُ", "aʿbud")] },
      { n: 6, words: [w("لَكُمْ", "lakum"), w("دِينُكُمْ", "dīnukum"), w("وَلِيَ", "wa-liya"), w("دِينِ", "dīn")] },
    ],
  },
  {
    n: 108, name_ar: "الْكَوْثَر", name_de: "Die Fuelle", translit: "Al-Kawṯar",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("إِنَّا", "innā"), w("أَعْطَيْنَاكَ", "aʿṭaynāka"), w("الْكَوْثَرَ", "l-kawṯar")] },
      { n: 2, words: [w("فَصَلِّ", "fa-ṣalli"), w("لِرَبِّكَ", "lirabbika"), w("وَانْحَرْ", "wa-nḥar")] },
      { n: 3, words: [w("إِنَّ", "inna"), w("شَانِئَكَ", "šāniʾaka"), w("هُوَ", "huwa"), w("الْأَبْتَرُ", "l-abtar")] },
    ],
  },
  {
    n: 107, name_ar: "الْمَاعُون", name_de: "Die Hilfeleistung", translit: "Al-Māʿūn",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("أَرَأَيْتَ", "araʾayta"), w("الَّذِي", "allaḏī"), w("يُكَذِّبُ", "yukaḏḏibu"), w("بِالدِّينِ", "bi-d-dīn")] },
      { n: 2, words: [w("فَذَٰلِكَ", "fa-ḏālika"), w("الَّذِي", "allaḏī"), w("يَدُعُّ", "yaduʿʿu"), w("الْيَتِيمَ", "l-yatīm")] },
      { n: 3, words: [w("وَلَا", "wa-lā"), w("يَحُضُّ", "yaḥuḍḍu"), w("عَلَىٰ", "ʿalā"), w("طَعَامِ", "ṭaʿāmi"), w("الْمِسْكِينِ", "l-miskīn")] },
      { n: 4, words: [w("فَوَيْلٌ", "fa-waylun"), w("لِّلْمُصَلِّينَ", "li-l-muṣallīn")] },
      { n: 5, words: [w("الَّذِينَ", "allaḏīna"), w("هُمْ", "hum"), w("عَن", "ʿan"), w("صَلَاتِهِمْ", "ṣalātihim"), w("سَاهُونَ", "sāhūn")] },
      { n: 6, words: [w("الَّذِينَ", "allaḏīna"), w("هُمْ", "hum"), w("يُرَاءُونَ", "yurāʾūn")] },
      { n: 7, words: [w("وَيَمْنَعُونَ", "wa-yamnaʿūna"), w("الْمَاعُونَ", "l-māʿūn")] },
    ],
  },
  {
    n: 106, name_ar: "قُرَيْش", name_de: "Quraisch", translit: "Quraiš",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("لِإِيلَافِ", "li-īlāfi"), w("قُرَيْشٍ", "quraiš")] },
      { n: 2, words: [w("إِيلَافِهِمْ", "īlāfihim"), w("رِحْلَةَ", "riḥlata"), w("الشِّتَاءِ", "š-šitāʾi"), w("وَالصَّيْفِ", "wa-ṣ-ṣayf")] },
      { n: 3, words: [w("فَلْيَعْبُدُوا", "fa-l-yaʿbudū"), w("رَبَّ", "rabba"), w("هَٰذَا", "hāḏā"), w("الْبَيْتِ", "l-bayt")] },
      { n: 4, words: [w("الَّذِي", "allaḏī"), w("أَطْعَمَهُم", "aṭʿamahum"), w("مِّن", "min"), w("جُوعٍ", "jūʿin"), w("وَآمَنَهُم", "wa-āmanahum"), w("مِّنْ", "min"), w("خَوْفٍ", "ḵawf")] },
    ],
  },
  {
    n: 105, name_ar: "الْفِيل", name_de: "Der Elefant", translit: "Al-Fīl",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("أَلَمْ", "alam"), w("تَرَ", "tara"), w("كَيْفَ", "kayfa"), w("فَعَلَ", "faʿala"), w("رَبُّكَ", "rabbuka"), w("بِأَصْحَابِ", "bi-aṣḥābi"), w("الْفِيلِ", "l-fīl")] },
      { n: 2, words: [w("أَلَمْ", "alam"), w("يَجْعَلْ", "yajʿal"), w("كَيْدَهُمْ", "kaydahum"), w("فِي", "fī"), w("تَضْلِيلٍ", "taḍlīl")] },
      { n: 3, words: [w("وَأَرْسَلَ", "wa-arsala"), w("عَلَيْهِمْ", "ʿalayhim"), w("طَيْرًا", "ṭayran"), w("أَبَابِيلَ", "abābīl")] },
      { n: 4, words: [w("تَرْمِيهِم", "tarmīhim"), w("بِحِجَارَةٍ", "biḥijāratin"), w("مِّن", "min"), w("سِجِّيلٍ", "sijjīl")] },
      { n: 5, words: [w("فَجَعَلَهُمْ", "fa-jaʿalahum"), w("كَعَصْفٍ", "kaʿaṣfin"), w("مَّأْكُولٍ", "maʾkūl")] },
    ],
  },
  {
    n: 104, name_ar: "الْهُمَزَة", name_de: "Der Verleumder", translit: "Al-Humaza",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("وَيْلٌ", "waylun"), w("لِّكُلِّ", "likulli"), w("هُمَزَةٍ", "humazatin"), w("لُّمَزَةٍ", "lumaza")] },
      { n: 2, words: [w("الَّذِي", "allaḏī"), w("جَمَعَ", "jamaʿa"), w("مَالًا", "mālan"), w("وَعَدَّدَهُ", "wa-ʿaddadah")] },
      { n: 3, words: [w("يَحْسَبُ", "yaḥsabu"), w("أَنَّ", "anna"), w("مَالَهُ", "mālahu"), w("أَخْلَدَهُ", "aḵladah")] },
      { n: 4, words: [w("كَلَّا", "kallā"), w("لَيُنبَذَنَّ", "layunbaḏanna"), w("فِي", "fī"), w("الْحُطَمَةِ", "l-ḥuṭama")] },
      { n: 5, words: [w("وَمَا", "wa-mā"), w("أَدْرَاكَ", "adrāka"), w("مَا", "mā"), w("الْحُطَمَةُ", "l-ḥuṭama")] },
      { n: 6, words: [w("نَارُ", "nāru"), w("اللَّهِ", "llāhi"), w("الْمُوقَدَةُ", "l-mūqada")] },
      { n: 7, words: [w("الَّتِي", "allatī"), w("تَطَّلِعُ", "taṭṭaliʿu"), w("عَلَى", "ʿalā"), w("الْأَفْئِدَةِ", "l-afʾida")] },
      { n: 8, words: [w("إِنَّهَا", "innahā"), w("عَلَيْهِم", "ʿalayhim"), w("مُّؤْصَدَةٌ", "muʾṣada")] },
      { n: 9, words: [w("فِي", "fī"), w("عَمَدٍ", "ʿamadin"), w("مُّمَدَّدَةٍ", "mumaddada")] },
    ],
  },
  {
    n: 103, name_ar: "الْعَصْر", name_de: "Der Nachmittag", translit: "Al-ʿAṣr",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("وَالْعَصْرِ", "wa-l-ʿaṣr")] },
      { n: 2, words: [w("إِنَّ", "inna"), w("الْإِنسَانَ", "l-insāna"), w("لَفِي", "lafī"), w("خُسْرٍ", "ḵusr")] },
      { n: 3, words: [w("إِلَّا", "illā"), w("الَّذِينَ", "allaḏīna"), w("آمَنُوا", "āmanū"), w("وَعَمِلُوا", "wa-ʿamilū"), w("الصَّالِحَاتِ", "ṣ-ṣāliḥāti"), w("وَتَوَاصَوْا", "wa-tawāṣaw"), w("بِالْحَقِّ", "bi-l-ḥaqqi"), w("وَتَوَاصَوْا", "wa-tawāṣaw"), w("بِالصَّبْرِ", "bi-ṣ-ṣabr")] },
    ],
  },
  {
    n: 102, name_ar: "التَّكَاثُر", name_de: "Das Streben nach Mehr", translit: "At-Takāṯur",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("أَلْهَاكُمُ", "alhākumu"), w("التَّكَاثُرُ", "t-takāṯur")] },
      { n: 2, words: [w("حَتَّىٰ", "ḥattā"), w("زُرْتُمُ", "zurtumu"), w("الْمَقَابِرَ", "l-maqābir")] },
      { n: 3, words: [w("كَلَّا", "kallā"), w("سَوْفَ", "sawfa"), w("تَعْلَمُونَ", "taʿlamūn")] },
      { n: 4, words: [w("ثُمَّ", "ṯumma"), w("كَلَّا", "kallā"), w("سَوْفَ", "sawfa"), w("تَعْلَمُونَ", "taʿlamūn")] },
      { n: 5, words: [w("كَلَّا", "kallā"), w("لَوْ", "law"), w("تَعْلَمُونَ", "taʿlamūna"), w("عِلْمَ", "ʿilma"), w("الْيَقِينِ", "l-yaqīn")] },
      { n: 6, words: [w("لَتَرَوُنَّ", "latarawunna"), w("الْجَحِيمَ", "l-jaḥīm")] },
      { n: 7, words: [w("ثُمَّ", "ṯumma"), w("لَتَرَوُنَّهَا", "latarawunnahā"), w("عَيْنَ", "ʿayna"), w("الْيَقِينِ", "l-yaqīn")] },
      { n: 8, words: [w("ثُمَّ", "ṯumma"), w("لَتُسْأَلُنَّ", "latusʾalunna"), w("يَوْمَئِذٍ", "yawmaʾiḏin"), w("عَنِ", "ʿani"), w("النَّعِيمِ", "n-naʿīm")] },
    ],
  },
  {
    n: 101, name_ar: "الْقَارِعَة", name_de: "Das Verheerende", translit: "Al-Qāriʿa",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("الْقَارِعَةُ", "l-qāriʿa")] },
      { n: 2, words: [w("مَا", "mā"), w("الْقَارِعَةُ", "l-qāriʿa")] },
      { n: 3, words: [w("وَمَا", "wa-mā"), w("أَدْرَاكَ", "adrāka"), w("مَا", "mā"), w("الْقَارِعَةُ", "l-qāriʿa")] },
      { n: 4, words: [w("يَوْمَ", "yawma"), w("يَكُونُ", "yakūnu"), w("النَّاسُ", "n-nāsu"), w("كَالْفَرَاشِ", "ka-l-farāši"), w("الْمَبْثُوثِ", "l-mabṯūṯ")] },
      { n: 5, words: [w("وَتَكُونُ", "wa-takūnu"), w("الْجِبَالُ", "l-jibālu"), w("كَالْعِهْنِ", "ka-l-ʿihni"), w("الْمَنفُوشِ", "l-manfūš")] },
      { n: 6, words: [w("فَأَمَّا", "fa-ammā"), w("مَن", "man"), w("ثَقُلَتْ", "ṯaqulat"), w("مَوَازِينُهُ", "mawāzīnuh")] },
      { n: 7, words: [w("فَهُوَ", "fahuwa"), w("فِي", "fī"), w("عِيشَةٍ", "ʿīšatin"), w("رَّاضِيَةٍ", "rāḍiya")] },
      { n: 8, words: [w("وَأَمَّا", "wa-ammā"), w("مَنْ", "man"), w("خَفَّتْ", "ḵaffat"), w("مَوَازِينُهُ", "mawāzīnuh")] },
      { n: 9, words: [w("فَأُمُّهُ", "fa-ummuhu"), w("هَاوِيَةٌ", "hāwiya")] },
      { n: 10, words: [w("وَمَا", "wa-mā"), w("أَدْرَاكَ", "adrāka"), w("مَا", "mā"), w("هِيَهْ", "hiyah")] },
      { n: 11, words: [w("نَارٌ", "nārun"), w("حَامِيَةٌ", "ḥāmiya")] },
    ],
  },
  {
    n: 100, name_ar: "الْعَادِيَات", name_de: "Die Laufenden", translit: "Al-ʿĀdiyāt",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("وَالْعَادِيَاتِ", "wa-l-ʿādiyāti"), w("ضَبْحًا", "ḍabḥā")] },
      { n: 2, words: [w("فَالْمُورِيَاتِ", "fa-l-mūriyāti"), w("قَدْحًا", "qadḥā")] },
      { n: 3, words: [w("فَالْمُغِيرَاتِ", "fa-l-muġīrāti"), w("صُبْحًا", "ṣubḥā")] },
      { n: 4, words: [w("فَأَثَرْنَ", "fa-aṯarna"), w("بِهِ", "bihi"), w("نَقْعًا", "naqʿā")] },
      { n: 5, words: [w("فَوَسَطْنَ", "fa-wasaṭna"), w("بِهِ", "bihi"), w("جَمْعًا", "jamʿā")] },
      { n: 6, words: [w("إِنَّ", "inna"), w("الْإِنسَانَ", "l-insāna"), w("لِرَبِّهِ", "lirabbihi"), w("لَكَنُودٌ", "lakanūd")] },
      { n: 7, words: [w("وَإِنَّهُ", "wa-innahu"), w("عَلَىٰ", "ʿalā"), w("ذَٰلِكَ", "ḏālika"), w("لَشَهِيدٌ", "lašahīd")] },
      { n: 8, words: [w("وَإِنَّهُ", "wa-innahu"), w("لِحُبِّ", "liḥubbi"), w("الْخَيْرِ", "l-ḵayri"), w("لَشَدِيدٌ", "lašadīd")] },
    ],
  },
  {
    n: 99, name_ar: "الزَّلْزَلَة", name_de: "Das Beben", translit: "Az-Zalzala",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("إِذَا", "iḏā"), w("زُلْزِلَتِ", "zulzilati"), w("الْأَرْضُ", "l-arḍu"), w("زِلْزَالَهَا", "zilzālahā")] },
      { n: 2, words: [w("وَأَخْرَجَتِ", "wa-aḵrajati"), w("الْأَرْضُ", "l-arḍu"), w("أَثْقَالَهَا", "aṯqālahā")] },
      { n: 3, words: [w("وَقَالَ", "wa-qāla"), w("الْإِنسَانُ", "l-insānu"), w("مَا", "mā"), w("لَهَا", "lahā")] },
      { n: 4, words: [w("يَوْمَئِذٍ", "yawmaʾiḏin"), w("تُحَدِّثُ", "tuḥaddiṯu"), w("أَخْبَارَهَا", "aḵbārahā")] },
      { n: 5, words: [w("بِأَنَّ", "bi-anna"), w("رَبَّكَ", "rabbaka"), w("أَوْحَىٰ", "awḥā"), w("لَهَا", "lahā")] },
      { n: 6, words: [w("يَوْمَئِذٍ", "yawmaʾiḏin"), w("يَصْدُرُ", "yaṣduru"), w("النَّاسُ", "n-nāsu"), w("أَشْتَاتًا", "aštātan"), w("لِّيُرَوْا", "liyuraw"), w("أَعْمَالَهُمْ", "aʿmālahum")] },
      { n: 7, words: [w("فَمَن", "faman"), w("يَعْمَلْ", "yaʿmal"), w("مِثْقَالَ", "miṯqāla"), w("ذَرَّةٍ", "ḏarratin"), w("خَيْرًا", "ḵayran"), w("يَرَهُ", "yarah")] },
      { n: 8, words: [w("وَمَن", "wa-man"), w("يَعْمَلْ", "yaʿmal"), w("مِثْقَالَ", "miṯqāla"), w("ذَرَّةٍ", "ḏarratin"), w("شَرًّا", "šarran"), w("يَرَهُ", "yarah")] },
    ],
  },
  {
    n: 97, name_ar: "الْقَدْر", name_de: "Die Bestimmung", translit: "Al-Qadr",
    ayat: [
      { n: 0, words: BASMALA },
      { n: 1, words: [w("إِنَّا", "innā"), w("أَنزَلْنَاهُ", "anzalnāhu"), w("فِي", "fī"), w("لَيْلَةِ", "laylati"), w("الْقَدْرِ", "l-qadr")] },
      { n: 2, words: [w("وَمَا", "wa-mā"), w("أَدْرَاكَ", "adrāka"), w("مَا", "mā"), w("لَيْلَةُ", "laylatu"), w("الْقَدْرِ", "l-qadr")] },
      { n: 3, words: [w("لَيْلَةُ", "laylatu"), w("الْقَدْرِ", "l-qadri"), w("خَيْرٌ", "ḵayrun"), w("مِّنْ", "min"), w("أَلْفِ", "alfi"), w("شَهْرٍ", "šahr")] },
      { n: 4, words: [w("تَنَزَّلُ", "tanazzalu"), w("الْمَلَائِكَةُ", "l-malāʾikatu"), w("وَالرُّوحُ", "wa-r-rūḥu"), w("فِيهَا", "fīhā"), w("بِإِذْنِ", "bi-iḏni"), w("رَبِّهِم", "rabbihim"), w("مِّن", "min"), w("كُلِّ", "kulli"), w("أَمْرٍ", "amr")] },
      { n: 5, words: [w("سَلَامٌ", "salāmun"), w("هِيَ", "hiya"), w("حَتَّىٰ", "ḥattā"), w("مَطْلَعِ", "maṭlaʿi"), w("الْفَجْرِ", "l-fajr")] },
    ],
  },
];

export const SURAH_MAP: Record<number, Surah> = Object.fromEntries(SURAHS.map((s) => [s.n, s]));
