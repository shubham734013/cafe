import React from 'react';

interface MenuProductArtworkProps {
  src: string;
  name: string;
  className?: string;
}

type ArtworkKind =
  | 'burger'
  | 'pizza'
  | 'maggi'
  | 'sandwich'
  | 'bread-pizza'
  | 'fries'
  | 'momos'
  | 'cold-coffee'
  | 'shake'
  | 'chai'
  | 'coffee';

function getArtworkKind(src: string): ArtworkKind | null {
  const imagePath = src.toLowerCase();
  if (imagePath.includes('bread_pizza')) return 'bread-pizza';
  if (imagePath.includes('burger')) return 'burger';
  if (imagePath.includes('pizza')) return 'pizza';
  if (imagePath.includes('maggi')) return 'maggi';
  if (imagePath.includes('sandwich')) return 'sandwich';
  if (imagePath.includes('fries')) return 'fries';
  if (imagePath.includes('momos')) return 'momos';
  if (imagePath.includes('cold_coffee')) return 'cold-coffee';
  if (imagePath.includes('shakes') || imagePath.includes('strawberry_shake')) return 'shake';
  if (imagePath.includes('kulhad_chai')) return 'chai';
  if (imagePath.includes('hot_beverage')) return 'coffee';
  return null;
}

export function hasMenuProductArtwork(src: string): boolean {
  return getArtworkKind(src) !== null;
}

function getSeed(value: string): number {
  return [...value].reduce((seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function BurgerArt({ name, seed }: { name: string; seed: number }) {
  const paneer = name.toLowerCase().includes('paneer');
  const double = name.toLowerCase().includes('double');
  const patty = paneer ? '#F0D8A5' : '#98502F';
  const accent = ['#E64D3D', '#F3A712', '#7E9A45'][seed % 3];

  return (
    <>
      <ellipse cx="100" cy="158" rx="66" ry="10" fill="#6F4A34" opacity=".14" />
      <path d="M37 132h126l-7 19c-2 7-11 11-22 11H66c-12 0-20-4-22-11z" fill="#D98A42" />
      {double && <rect x="41" y="115" width="118" height="13" rx="6" fill={patty} />}
      <path d="m38 113 124 1-20 13H57z" fill={accent} />
      <rect x="42" y="99" width="116" height="14" rx="7" fill={patty} />
      <path d="M39 96q12-12 24 0 12-12 24 0 13-13 26 0 13-13 26 0 13-12 25 0l-5 8H44z" fill="#5E8B4A" />
      <rect x="46" y="86" width="108" height="10" rx="5" fill="#E4513E" />
      <path d="M40 84c0-31 27-48 60-48s60 17 60 48z" fill="#D88A47" />
      <path d="M49 73c10-18 28-27 51-27s41 9 51 27" fill="none" stroke="#F0B66A" strokeWidth="7" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((index) => (
        <ellipse
          key={index}
          cx={68 + index * 16 + (seed % 5)}
          cy={62 + (index % 2) * 7}
          rx="2.4"
          ry="1.3"
          fill="#FFF2D8"
          transform={`rotate(-18 ${68 + index * 16 + (seed % 5)} ${62 + (index % 2) * 7})`}
        />
      ))}
    </>
  );
}

function PizzaArt({ name, seed }: { name: string; seed: number }) {
  const lowerName = name.toLowerCase();
  const toppingColor = lowerName.includes('tandoori')
    ? '#C94B32'
    : lowerName.includes('paneer')
      ? '#F3E2B8'
      : lowerName.includes('corn')
        ? '#F6BD3B'
        : '#4F8B5C';
  const toppings = Array.from({ length: 9 }, (_, index) => {
    const angle = ((index * 137 + seed % 360) * Math.PI) / 180;
    const radius = 19 + ((index * 7 + seed) % 25);
    return {
      x: 100 + Math.cos(angle) * radius,
      y: 101 + Math.sin(angle) * radius,
      size: 3 + ((index + seed) % 3),
    };
  });

  return (
    <>
      <ellipse cx="100" cy="156" rx="68" ry="9" fill="#6F4A34" opacity=".14" />
      <circle cx="100" cy="99" r="67" fill="#B9673D" />
      <circle cx="100" cy="96" r="58" fill="#F2C06B" />
      <circle cx="100" cy="96" r="50" fill="#F8D984" />
      {toppings.map((topping, index) =>
        index % 3 === 0 ? (
          <circle key={index} cx={topping.x} cy={topping.y} r={topping.size} fill={toppingColor} />
        ) : index % 3 === 1 ? (
          <rect
            key={index}
            x={topping.x - topping.size}
            y={topping.y - topping.size}
            width={topping.size * 2}
            height={topping.size * 2}
            rx="1.5"
            fill={lowerName.includes('paneer') ? '#FFF5D9' : '#D85A43'}
          />
        ) : (
          <path
            key={index}
            d={`M${topping.x - topping.size} ${topping.y}q${topping.size} -${topping.size * 2} ${topping.size * 2} 0q-${topping.size} ${topping.size * 2} -${topping.size * 2} 0`}
            fill="none"
            stroke={lowerName.includes('double cheese') ? '#FFF1B6' : '#47784B'}
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        )
      )}
      <circle cx="100" cy="96" r="55" fill="none" stroke="#F3E0B0" strokeWidth="5" />
    </>
  );
}

function MaggiArt({ name, seed }: { name: string; seed: number }) {
  const cheesy = name.toLowerCase().includes('cheesy');
  const spicy = /masala|tandoori/i.test(name);
  const noodleColor = cheesy ? '#F3C742' : '#E5A33B';
  const toppings = Array.from({ length: 7 }, (_, index) => ({
    x: 67 + ((index * 31 + seed) % 68),
    y: 103 + ((index * 17 + seed) % 28),
  }));

  return (
    <>
      <path d="M53 103h94l-9 47c-2 12-12 19-38 19s-36-7-38-19z" fill="#D97245" />
      <ellipse cx="100" cy="103" rx="48" ry="14" fill="#F8E7C7" />
      {[0, 1, 2, 3].map((line) => (
        <path
          key={line}
          d={`M${65 + line * 3} ${100 + line * 4}c8-13 13 13 21 0s13 13 21 0 13 13 21 0 12 13 18 0`}
          fill="none"
          stroke={noodleColor}
          strokeWidth="4"
          strokeLinecap="round"
        />
      ))}
      {toppings.map((topping, index) => (
        <circle
          key={index}
          cx={topping.x}
          cy={topping.y}
          r={index % 2 ? 3 : 4}
          fill={spicy ? '#C84E32' : cheesy ? '#FFD65D' : '#5F9254'}
        />
      ))}
      <path d="M74 71q-8-12 0-23m25 23q-8-12 0-23m25 23q-8-12 0-23" fill="none" stroke="#FFF9EC" strokeWidth="3" strokeLinecap="round" opacity=".8" />
    </>
  );
}

function SandwichArt({ name, seed }: { name: string; seed: number }) {
  const paneer = name.toLowerCase().includes('paneer');
  const cheese = name.toLowerCase().includes('cheese');
  const filling = paneer ? '#F1D69B' : cheese ? '#F2C83D' : '#5B9554';
  const garnish = ['#CF5442', '#E3A637', '#57925B'][seed % 3];

  return (
    <>
      <ellipse cx="100" cy="157" rx="67" ry="9" fill="#6F4A34" opacity=".14" />
      <path d="M42 133 100 59l59 74v15H42z" fill="#C77B43" />
      <path d="M50 128 100 68l51 60z" fill="#F1C982" />
      <path d="m55 126 45-52 45 52-7 9H62z" fill={filling} />
      <path d="m62 136 38 11 38-11" fill="none" stroke={garnish} strokeWidth="7" strokeLinecap="round" />
      <path d="M42 133 100 59l59 74" fill="none" stroke="#F7D99F" strokeWidth="6" strokeLinejoin="round" />
      {cheese && <path d="m75 117 20 7-8 12z" fill="#F4D653" />}
      {[0, 1, 2].map((index) => (
        <circle key={index} cx={78 + index * 20 + (seed % 7)} cy={111 - (index % 2) * 13} r="3.5" fill={paneer ? '#FFF0D0' : '#D64D3D'} />
      ))}
    </>
  );
}

function BreadPizzaArt({ name, seed }: { name: string; seed: number }) {
  const smiley = name.toLowerCase().includes('smiley');
  const accent = ['#E05242', '#5D914F', '#F2B842'][seed % 3];

  return (
    <>
      <ellipse cx="100" cy="157" rx="65" ry="9" fill="#6F4A34" opacity=".14" />
      <rect x="44" y="63" width="112" height="85" rx="24" fill="#CB7B42" />
      <rect x="51" y="69" width="98" height="70" rx="19" fill="#F3D28C" />
      <rect x="59" y="77" width="82" height="54" rx="15" fill="#F9D96F" />
      {smiley ? (
        <>
          <circle cx="82" cy="97" r="5" fill="#7B442E" />
          <circle cx="118" cy="97" r="5" fill="#7B442E" />
          <path d="M78 109q22 25 44 0" fill="none" stroke="#7B442E" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        [0, 1, 2, 3, 4].map((index) => (
          <circle key={index} cx={73 + ((index * 29 + seed) % 55)} cy={88 + ((index * 17 + seed) % 33)} r="4" fill={index % 2 ? accent : '#5D914F'} />
        ))
      )}
      <path d="M65 136h70" stroke="#F7E5B6" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function FriesArt() {
  return (
    <>
      <ellipse cx="100" cy="158" rx="45" ry="8" fill="#6F4A34" opacity=".14" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <rect key={index} x={66 + index * 12} y={45 + (index % 3) * 5} width="10" height="75" rx="4" fill={index % 2 ? '#F5C13D' : '#EAA82B'} transform={`rotate(${(index - 2) * 5} ${71 + index * 12} 83)`} />
      ))}
      <path d="m59 100 82 0-11 55q-2 8-10 8H80q-8 0-10-8z" fill="#C74435" />
      <path d="M76 118h48" stroke="#F7D77C" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function MomosArt({ name, seed }: { name: string; seed: number }) {
  const fried = name.toLowerCase().includes('fried');

  return (
    <>
      <ellipse cx="100" cy="151" rx="66" ry="14" fill="#C8A581" />
      <ellipse cx="100" cy="146" rx="61" ry="13" fill="#F6E5CC" />
      {[0, 1, 2, 3, 4].map((index) => {
        const x = 56 + index * 22;
        const y = index % 2 ? 121 : 112;
        const fill = fried ? ['#DFA456', '#C98242', '#E6B261'][index % 3] : '#FFF8EA';
        return (
          <g key={index} transform={`rotate(${(index - 2) * 7 + (seed % 5)} ${x} ${y})`}>
            <path d={`M${x - 13} ${y + 13}q-5-26 13-27 18 1 13 27-13 9-26 0z`} fill={fill} stroke="#C89A70" strokeWidth="1.5" />
            <path d={`M${x - 7} ${y - 10}q7 12 0 25m7-25q-5 12 0 25m7-25q-6 12 0 25`} fill="none" stroke="#C89A70" strokeWidth="1.4" />
          </g>
        );
      })}
      <ellipse cx="100" cy="96" rx="15" ry="8" fill={fried ? '#B9442F' : '#D94C36'} />
      <ellipse cx="100" cy="95" rx="11" ry="4" fill="#F06D42" />
    </>
  );
}

function ColdCoffeeArt({ name, seed }: { name: string; seed: number }) {
  const withIceCream = name.toLowerCase().includes('ice cream');

  return (
    <>
      <ellipse cx="100" cy="158" rx="42" ry="8" fill="#6F4A34" opacity=".14" />
      <path d="M63 63h74l-8 89q-1 8-9 8H80q-8 0-9-8z" fill="#E8F0E7" opacity=".82" stroke="#B6C7BB" strokeWidth="3" />
      <path d="M70 97h60l-5 54q-1 5-7 5H82q-6 0-7-5z" fill="#875237" />
      <path d="M76 110h48" stroke="#B77C56" strokeWidth="4" opacity=".8" />
      {[0, 1, 2].map((index) => <rect key={index} x={79 + index * 17 + (seed % 4)} y={85 + (index % 2) * 9} width="12" height="12" rx="3" fill="#F4F4E8" opacity=".9" transform={`rotate(20 ${85 + index * 17} 91)`} />)}
      <path d="m117 38 8 64" stroke="#E95C47" strokeWidth="5" strokeLinecap="round" />
      {withIceCream && <><circle cx="99" cy="65" r="17" fill="#F8E9C9" /><path d="M85 68q14-22 28 0" fill="#FFF8E7" /></>}
      {!withIceCream && <path d="M72 92q28-14 56 0" fill="none" stroke="#E6D6C1" strokeWidth="5" />}
    </>
  );
}

function ShakeArt({ name, seed }: { name: string; seed: number }) {
  const lowerName = name.toLowerCase();
  const flavor = lowerName.includes('strawberry')
    ? '#D97588'
    : lowerName.includes('chocolate') || lowerName.includes('kit kat') || lowerName.includes('oreo')
      ? '#80503D'
      : lowerName.includes('butterscotch') || lowerName.includes('biscoff')
        ? '#D7A14E'
        : '#E8D0A2';
  const topping = lowerName.includes('oreo')
    ? '#382A28'
    : lowerName.includes('biscoff')
      ? '#AD6B3F'
      : '#F4E7D1';

  return (
    <>
      <ellipse cx="100" cy="158" rx="43" ry="8" fill="#6F4A34" opacity=".14" />
      <path d="M67 71h66l-8 81q-1 8-9 8H84q-8 0-9-8z" fill="#F3F0E5" opacity=".72" stroke="#C9C0AE" strokeWidth="3" />
      <path d="M73 105h54l-5 45q0 5-7 5H85q-7 0-7-5z" fill={flavor} />
      <path d="M74 104q26-10 52 0" fill="none" stroke="#FFF5E7" strokeWidth="6" />
      <path d="m115 42 7 62" stroke={lowerName.includes('strawberry') ? '#D34463' : '#C84F3B'} strokeWidth="5" strokeLinecap="round" />
      <path d="M76 75q24-18 48 0" fill="none" stroke="#FFF8EB" strokeWidth="9" strokeLinecap="round" />
      {[0, 1, 2].map((index) => (
        <circle key={index} cx={87 + index * 15 + (seed % 6)} cy={68 - (index % 2) * 6} r={index === 1 ? 5 : 3.5} fill={topping} />
      ))}
      {lowerName.includes('strawberry') && <path d="m88 88 8 7m10-9 8 7" stroke="#C94F68" strokeWidth="3" strokeLinecap="round" />}
      {(lowerName.includes('kit kat') || lowerName.includes('biscoff')) && <rect x="124" y="62" width="10" height="30" rx="3" fill={topping} transform={`rotate(14 129 77)`} />}
    </>
  );
}

function HotDrinkArt({ name, seed, chai }: { name: string; seed: number; chai: boolean }) {
  const kulhad = chai && name.toLowerCase().includes('kulhad');
  const liquid = name.toLowerCase().includes('black coffee') ? '#563426' : '#B67842';
  const cup = kulhad ? '#B96D43' : '#F7E8D2';

  return (
    <>
      <ellipse cx="100" cy="154" rx="47" ry="8" fill="#6F4A34" opacity=".14" />
      <path d="M55 79h84v51q0 26-42 26t-42-26z" fill={cup} stroke={kulhad ? '#914D31' : '#D7BA91'} strokeWidth="3" />
      <ellipse cx="97" cy="80" rx="42" ry="11" fill="#EFE0C7" />
      <ellipse cx="97" cy="82" rx="35" ry="7" fill={liquid} />
      {!kulhad && <path d="M139 91q30-3 19 24-5 10-19 8" fill="none" stroke="#D7BA91" strokeWidth="8" />}
      {kulhad && <path d="M59 102h76m-72 15h68" stroke="#D99261" strokeWidth="3" opacity=".8" />}
      {[0, 1, 2].map((index) => <path key={index} d={`M${79 + index * 18} 60q-7-12 0-21`} fill="none" stroke="#FFF9EF" strokeWidth="3" strokeLinecap="round" opacity={0.75 - index * 0.12} />)}
      <circle cx={105 + (seed % 8)} cy="81" r="2" fill="#F3D6A9" />
    </>
  );
}

export const MenuProductArtwork: React.FC<MenuProductArtworkProps> = ({ src, name, className }) => {
  const kind = getArtworkKind(src);
  if (!kind) return null;

  const seed = getSeed(name);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const titleId = `menu-artwork-${slug}-${seed}`;

  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-labelledby={titleId}
      className={className}
      preserveAspectRatio="xMidYMid slice"
    >
      <title id={titleId}>{name}</title>
      <defs>
        <radialGradient id={`${titleId}-background`} cx="50%" cy="36%" r="75%">
          <stop offset="0%" stopColor={['#FFF8EC', '#FFF4E4', '#F8EBDD'][seed % 3]} />
          <stop offset="100%" stopColor={['#EBD8BE', '#E9D1B3', '#E6D8C8'][(seed >>> 3) % 3]} />
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#${titleId}-background)`} />
      <circle cx="100" cy="100" r="86" fill="#FFFDF8" opacity=".34" />
      {kind === 'burger' && <BurgerArt name={name} seed={seed} />}
      {kind === 'pizza' && <PizzaArt name={name} seed={seed} />}
      {kind === 'maggi' && <MaggiArt name={name} seed={seed} />}
      {kind === 'sandwich' && <SandwichArt name={name} seed={seed} />}
      {kind === 'bread-pizza' && <BreadPizzaArt name={name} seed={seed} />}
      {kind === 'fries' && <FriesArt />}
      {kind === 'momos' && <MomosArt name={name} seed={seed} />}
      {kind === 'cold-coffee' && <ColdCoffeeArt name={name} seed={seed} />}
      {kind === 'shake' && <ShakeArt name={name} seed={seed} />}
      {(kind === 'chai' || kind === 'coffee') && (
        <HotDrinkArt name={name} seed={seed} chai={kind === 'chai'} />
      )}
    </svg>
  );
};
