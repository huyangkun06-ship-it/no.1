from pathlib import Path
import json
p=Path(__file__).parent
s=p.joinpath('template.html').read_text().replace('/* STYLES */',p.joinpath('styles.css').read_text()).replace('/* DATA */',json.dumps(json.loads(p.joinpath('topics.json').read_text()),ensure_ascii=False).replace('</','<\\/')).replace('/* APP */',p.joinpath('app.js').read_text())
p.joinpath('index.html').write_text(s)
