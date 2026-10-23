// shortcut: one recruiter in this MVP; read from a recruiter profile doc when there are several
export const RECRUITER = { name: "Naledi Mokoena", org: "Tacit Recruitment", email: "naledi@tacit.test", phone: "+27 21 555 0142" } as const;
export const RECRUITER_FIRST = RECRUITER.name.split(" ")[0] ?? RECRUITER.name;
export const RECRUITER_INITIALS = RECRUITER.name.split(" ").map((w) => w[0]).join("");
