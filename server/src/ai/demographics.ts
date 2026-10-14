// Product rule: no demographic, family, health or photo signal is extracted or stored.
// Backstop behind the prompt: any model output that matches is dropped. Precise on purpose so ERP and recruiter
// vocabulary survives ("SAP HR", "age analysis", "debtors aged 90 days", "implementation partner", "product family",
// "sick leave configuration", "Church Street"). A stated preference whose reason is family ("transfer to Cape Town")
// is kept as the preference only; the family fact itself is what must never be stored.
export const DEMOGRAPHIC = new RegExp(
  [
    String.raw`\b(gender|male|female|woman|women|transgender|pronouns?)\b`,
    String.raw`\b(gay|lesbian|bisexual|lgbt\w*|queer|sexual orientation)\b`,
    String.raw`\b(his|her|their|candidate'?s)\s+age\b|\bage\s*[:=]?\s*\d|\baged\s+\d{2}\b(?!\s*(days?|weeks?|months?))|\b\d{1,2}\s*(years?[- ]old|y\/?o)\b`,
    String.raw`\bdate of birth\b|\bdob\b|\bborn in\b|\bbirthday\b|\btoo (old|young)\b|\b(early|mid|late)[- ]?[2-6]0s\b|\bin (his|her|their) (twenties|thirties|forties|fifties|sixties)\b`,
    String.raw`\b(young|elderly|older|youthful)\s+(candidate|man|woman|guy|lady|person|applicant)\b`,
    String.raw`\b(race|racial|racist|ethnic\w*|afrikaner)\b|\b(black|white|coloured|indian|asian)\s+(male|female|man|woman|candidate|person|applicant)\b`,
    String.raw`\b(nationality|nationalities|citizenship|ethnicity)\b|\bcitizen\b(?!\s+(developer|data))`,
    String.raw`\b(relig\w*|muslim|islam\w*|christian|catholic|anglican|jewish|hindu|buddhist|sikh|atheist|prayers?|sabbath|ramadan)\b|\b(goes to|attends|at)\s+(church|mosque|temple|synagogue)\b`,
    String.raw`\b(disab\w*|illness|diagnos\w*|chronic|cancer|wheelchair|autis\w*|depression|medical condition|mental health|(his|her|their)\s+health|health (issues?|condition|problems?)|pregnan\w*|maternity)\b|\bmonths? (pregnant|along)\b`,
    String.raw`\b(married|marital|unmarried|divorced|widow\w*|husband|wife|spouse|girlfriend|boyfriend|children|kids?|baby|babies|daughter|mother|father|school run)\b|\b(his|her|their)\s+(partner|son|famil(y|ies))\b|\bpartner's\b|\bfamily (reasons|commitments|responsibilities)\b`,
    String.raw`\b(headshot|profile pic\w*)\b|\b(his|her|their|candidate'?s)\s+(photo|picture)\b|\bin the (photo|picture)\b`,
  ].join("|"),
  "i",
);

export const mentionsDemographic = (s: string): boolean => DEMOGRAPHIC.test(s);
