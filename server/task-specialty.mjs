const specialties = ['Frontend', 'Backend', 'Testing'];

export function classifyTask(tags) {
  const values = new Set(
    String(tags ?? '')
      .split(';')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
  const matches = specialties.filter((specialty) => values.has(specialty.toLowerCase()));
  return {
    specialty: matches.length === 1 ? matches[0] : null,
    classificationIssue: matches.length > 1 ? 'multiple' : matches.length === 0 ? 'missing' : null,
  };
}
