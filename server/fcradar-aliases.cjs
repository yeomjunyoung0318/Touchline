'use strict';

const nameKey = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
// Verify Korean spellings against FC Online's Data Center and player notices.
// FCRadar supplies the player records and their original names.
const players = [
  ['손흥민', 'Heung Min', ['Heung Min Son', 'Son Heung Min']],
  ['김민재', 'Min Jae', ['Min Jae Kim', 'Kim Min Jae']],
  ['이강인', 'Kang In', ['Kang In Lee', 'Lee Kang In']],
  ['황희찬', 'Hee Chan', ['Hee Chan Hwang', 'Hwang Hee Chan']],
  ['황인범', 'In Beom', ['In Beom Hwang', 'Hwang In Beom']],
  ['이재성', 'Jae Sung', ['Jae Sung Lee', 'Lee Jae Sung']],
  ['조규성', 'Gue Sung', ['Gue Sung Cho', 'Cho Gue Sung']],
  ['배준호', 'Jun Ho', ['Jun Ho Bae', 'Bae Jun Ho']],
  ['양현준', 'Hyun Jun', ['Hyun Jun Yang', 'Yang Hyun Jun']],
  ['오현규', 'Hyeon Gyu', ['Hyeon Gyu Oh', 'Oh Hyeon Gyu']],
  ['조현우', 'Hyeon Woo', ['Hyeon Woo Jo', 'Jo Hyeon Woo']],
  ['설영우', 'Young Woo', ['Young Woo Seol', 'Seol Young Woo']],
  ['홍현석', 'Hyun Seok', ['Hyun Seok Hong', 'Hong Hyun Seok']],
  ['김지수', 'Ji Soo', ['Ji Soo Kim', 'Kim Ji Soo', 'Ji Su Kim', 'Kim Ji Su']],
  ['엘링 홀란', 'Haaland', ['Erling Haaland', 'Erling Braut Haaland'], ['홀란', '홀란드', '할란드', '엘링 홀란드']],
  ['킬리안 음바페', 'Mbapp', ['Kylian Mbappé', 'Mbappé'], ['음바페']],
  ['리오넬 메시', 'Messi', ['Lionel Messi', 'Lionel Andrés Messi Cuccittini', 'Messi'], ['메시']],
  ['크리스티아누 호날두', 'Cristiano Ronaldo', ['Cristiano Ronaldo', 'Cristiano Ronaldo dos Santos Aveiro'], ['호날두', '크리스티아노 호날두']],
  ['네이마르', 'Neymar', ['Neymar', 'Neymar Jr', 'Neymar da Silva Santos Júnior']],
  ['비니시우스 JR', 'Vinícius', ['Vinícius Júnior', 'Vinícius Jr', 'Vini Jr', 'Vinícius José de Oliveira Júnior', 'Vinícius José Paixão de Oliveira Júnior'], ['비니시우스', '비니시우스 주니어', '비니시우스 주니오르']],
  ['주드 벨링엄', 'Bellingham', ['Jude Bellingham'], ['벨링엄', '벨링햄']],
  ['모하메드 살라', 'Salah', ['Mohamed Salah', 'Mohamed Salah Hamed Mahrous Ghaly'], ['살라']],
  ['라민 야말', 'Yamal', ['Lamine Yamal', 'Lamine Yamal Nasraoui Ebana'], ['야말']],
  ['부카요 사카', 'Saka', ['Bukayo Saka'], ['사카']],
  ['해리 케인', 'Harry Kane', ['Harry Kane'], ['케인']],
  ['케빈 더브라위너', 'De Bruyne', ['Kevin De Bruyne'], ['더브라위너', '데브라위너']],
  ['로드리', 'Rodri', ['Rodri', 'Rodrigo Hernández Cascante']],
  ['자말 무시알라', 'Musiala', ['Jamal Musiala'], ['무시알라']],
  ['플로리안 비르츠', 'Wirtz', ['Florian Wirtz'], ['비르츠']],
  ['페드리', 'Pedri', ['Pedri', 'Pedro González López']],
  ['가비', 'Gavi', ['Gavi', 'Pablo Martín Páez Gavira']],
  ['버질 반다이크', 'Van Dijk', ['Virgil van Dijk'], ['반다이크', '판데이크']],
  ['페데리코 발베르데', 'Valverde', ['Federico Valverde', 'Federico Santiago Valverde Dipetta'], ['발베르데']],
  ['윌리암 살리바', 'Saliba', ['William Saliba', 'William Alain André Gabriel Saliba'], ['살리바', '윌리엄 살리바']],
  ['후벵 디아스', 'Rúben Dias', ['Rúben Dias', 'Rúben dos Santos Gato Alves Dias'], ['루벤 디아스']],
  ['앙투안 그리즈만', 'Griezmann', ['Antoine Griezmann'], ['그리즈만']],
  ['빅터 오시멘', 'Osimhen', ['Victor Osimhen', 'Victor James Osimhen'], ['오시멘']],
  ['데클런 라이스', 'Declan Rice', ['Declan Rice'], ['라이스']],
  ['마르틴 외데고르', 'degaard', ['Martin Ødegaard', 'Martin Odegaard'], ['외데고르']],
  ['티보 쿠르투아', 'Courtois', ['Thibaut Courtois'], ['쿠르투아', '쿠르투와']],
  ['잔루이지 돈나룸마', 'Donnarumma', ['Gianluigi Donnarumma'], ['돈나룸마']],
  ['올리버 칸', 'Oliver Kahn', ['Oliver Kahn'], ['칸']],
  ['이케르 카시야스', 'Casillas', ['Iker Casillas', 'Casillas'], ['카시야스']],
  ['알리송', 'Alisson', ['Alisson', 'Alisson Becker', 'Alisson Ramsés Becker']],
  ['얀 오블라크', 'Oblak', ['Jan Oblak'], ['오블라크']],
  ['다비드 라야', 'David Raya', ['David Raya'], ['라야']],
  ['마이크 메냥', 'Maignan', ['Mike Maignan'], ['메냥']],
  ['그레고르 코벨', 'Kobel', ['Gregor Kobel'], ['코벨', '그레고어 코벨']],
  ['디오구 코스타', 'Diogo Costa', ['Diogo Costa']],
  ['에밀리아노 마르티네스', 'Emiliano Mart', ['Emiliano Martínez', 'Emiliano Martinez'], ['에밀리아노']],
  ['조던 픽퍼드', 'Pickford', ['Jordan Pickford'], ['픽퍼드']],
  ['나디네 앙게러', 'Angerer', ['Nadine Angerer'], ['앙게러']],
  ['마누엘 노이어', 'Neuer', ['Manuel Neuer'], ['노이어']],
];
const playerNameAliases = Object.freeze(players.flatMap(([korean, , names, aliases = []]) =>
  [korean, ...names, ...aliases]));
const playerQueries = new Map();
const localizedNames = new Map();
for (const [korean, query, names, aliases = []] of players) {
  for (const alias of [korean, ...aliases]) playerQueries.set(nameKey(alias), query);
  for (const name of names) localizedNames.set(nameKey(name), korean);
}

const clubNames = new Map(Object.entries({
  '레스터': 'Leicester City', '레스터시티': 'Leicester City',
  '스토크': 'Stoke City', '스토크시티': 'Stoke City', '선덜랜드': 'Sunderland',
  '브라이튼': 'Brighton & Hove Albion', '렉섬': 'Wrexham',
  '장크트파울리': 'FC St. Pauli', '릴': 'LOSC Lille', '서울': 'FC Seoul', 'fc서울': 'FC Seoul',
  '레알마드리드': 'Real Madrid', '레알': 'Real Madrid', '바르셀로나': 'FC Barcelona',
  '아스널': 'Arsenal', '아스날': 'Arsenal', '리버풀': 'Liverpool', '첼시': 'Chelsea',
  '맨시티': 'Manchester City', '맨체스터시티': 'Manchester City',
  '맨유': 'Manchester United', '맨체스터유나이티드': 'Manchester United',
  '토트넘': 'Tottenham', '뮌헨': 'Bayern', '바이에른뮌헨': 'Bayern', '도르트문트': 'Dortmund',
  '파리생제르맹': 'Paris Saint-Germain', '파리생제르망': 'Paris Saint-Germain',
  '유벤투스': 'Juventus', '아틀레티코마드리드': 'Atlético de Madrid',
}).map(([name, value]) => [nameKey(name), value]));
const nationNames = new Map(Object.entries({
  '대한민국': 'Korea Republic', '한국': 'Korea Republic', '잉글랜드': 'England',
  '프랑스': 'France', '브라질': 'Brazil', '아르헨티나': 'Argentina',
  '스페인': 'Spain', '독일': 'Germany', '포르투갈': 'Portugal', '이탈리아': 'Italy',
  '네덜란드': 'Netherlands', '일본': 'Japan', '노르웨이': 'Norway', '벨기에': 'Belgium',
}).map(([name, value]) => [nameKey(name), value]));

function searchText(field, value) {
  const aliases = field === 'club' ? clubNames : field === 'nationality' ? nationNames : playerQueries;
  if (field === 'search') return aliases.get(nameKey(value)) || value.trim();
  return value.split(',').map(part => aliases.get(nameKey(part)) || part.trim()).filter(Boolean).join(',');
}

function playerName(id, officialKoreanName, originalName, ...variants) {
  if (id === 238794) return '비니시우스 JR';
  if (officialKoreanName) return officialKoreanName;
  for (const name of [originalName, ...variants]) {
    if (typeof name !== 'string') continue;
    const korean = localizedNames.get(nameKey(name));
    if (korean) return korean;
  }
  return originalName;
}

const clubNameAliases = Object.freeze([...clubNames.keys()]);
module.exports = { nameKey, searchText, playerName, playerNameAliases, clubNameAliases };
