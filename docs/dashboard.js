const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatMonthYear(iso) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function quarterOf(iso) {
  const d = new Date(iso);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

function quarterSortKey(label) {
  const [q, y] = label.split(' ');
  return Number(y) * 10 + Number(q[1]);
}

async function loadDashboardData() {
  const res = await fetch('data.json', { cache: 'no-store' });
  return res.json();
}
