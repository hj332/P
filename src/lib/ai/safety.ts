// 최소 안전장치 (기획안 15장 "운영 전 유의사항").
// AI 가 지침을 놓쳐도, 위험 표현이 보이면 긴급 연락처가 항상 먼저 보이게 한다.
// 정식 위험도 분류·Rule Engine(기획안 11-5)은 MVP 이후. 이것은 그 대체가 아니다.

const PATTERNS: RegExp[] = [
  /죽고\s*싶/, /죽을\s*것\s*같/, /죽어\s*버리/, /죽겠다고/, /살기\s*싫/, /사라지고\s*싶/,
  /자살/, /자해/, /목을?\s*매/, /손목을?\s*(긋|그었|그어|그으)/, /뛰어\s*내리/,
  /죽이(겠|고\s*싶|려)/, /죽여\s*버리/, /가만\s*(두지|안\s*두)/, /찾아가(겠|서)/,
  /때렸/, /때린대/, /폭행/, /성추행/, /성폭력/, /흉기/, /칼을?\s*(들|가져)/,
];

// "자살예방교육" 같은 정보성 표현, "웃겨 죽겠다" 같은 일상 관용 표현은 경고 문구를 붙이지 않는다.
// (평가 세트 eval/eval-set.json 의 safety 문항으로 확인)
const BENIGN = [
  /자살\s*예방\s*교육/,
  /자살\s*예방\s*주간/,
  /폭력\s*예방\s*교육/,
  /(웃겨|좋아|재밌어|재미있어|배고파|졸려|더워|추워|심심해|귀여워|피곤해)\s*죽(겠|을\s*것\s*같)/,
];

export function needsEmergencyNotice(text: string): boolean {
  if (BENIGN.some((re) => re.test(text))) {
    const stripped = BENIGN.reduce((t, re) => t.replace(new RegExp(re, "g"), ""), text);
    return PATTERNS.some((re) => re.test(stripped));
  }
  return PATTERNS.some((re) => re.test(text));
}

export const EMERGENCY_NOTICE =
  "먼저 꼭 안내드릴게요. 지금 아이나 누군가가 위험한 상황이라면 학교 전달을 기다리지 마시고 바로 연락해 주세요.\n" +
  "· 위험하거나 범죄 피해가 의심될 때: 경찰 112\n" +
  "· 다쳤거나 응급 상황일 때: 119\n" +
  "· 자살·자해 관련 상담: 자살예방상담전화 109 (24시간)";
