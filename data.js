const PLAYERS = [
  { id: 'marcin', name: 'Marcin', title: 'Prezes Typów' },
  { id: 'fabian', name: 'Fabian', title: 'Biogazowy Strateg' },
  { id: 'hubert', name: 'Hubert', title: 'Kierowca Wyników' },
  { id: 'kamil', name: 'Kamil', title: 'Van Master' }
];

const GROUPS = 'ABCDEFGHIJKL'.split('');

const MATCHES = GROUPS.flatMap((group) => {
  const teams = [1, 2, 3, 4].map((n) => `Drużyna ${group}${n}`);
  const pairs = [
    [0, 1], [2, 3],
    [0, 2], [3, 1],
    [0, 3], [1, 2]
  ];
  return pairs.map((pair, index) => ({
    id: `${group}-${index + 1}`,
    group,
    round: Math.ceil((index + 1) / 2),
    home: teams[pair[0]],
    away: teams[pair[1]],
    date: 'Do uzupełnienia'
  }));
});
