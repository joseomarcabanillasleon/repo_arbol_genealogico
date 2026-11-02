// Árbol de ejemplo con personas ficticias (4 generaciones).
import { FamilyTree } from './store.js';

export function buildSample() {
  const t = new FamilyTree();
  const P = (givenName, surname, sex, birth = '', bplace = '', death = '', dplace = '', occupation = '') =>
    t.addPerson({ givenName, surname, sex, birth: { date: birth, place: bplace }, death: { date: death, place: dplace }, deceased: Boolean(death), occupation });

  // Generación 1 (bisabuelos)
  const manuel = P('Manuel', 'Herrera Quispe', 'M', '1902', 'Chiclayo, Lambayeque, Perú', '1978', 'Chiclayo, Perú', 'Agricultor');
  const rosa = P('Rosa', 'Vílchez Ramos', 'F', 'ABT 1905', 'Ferreñafe, Lambayeque, Perú', '1981', 'Chiclayo, Perú');
  const vicente = P('Vicente', 'Soler Martí', 'M', '1908', 'Sagunto, Valencia, España', '1990', 'Valencia, España', 'Carpintero');
  const amparo = P('Amparo', 'Roig Ferrer', 'F', '1911', 'Moncofa, Castellón, España', '1999', 'Valencia, España');

  // Generación 2 (abuelos)
  const jorge = P('Jorge', 'Herrera Vílchez', 'M', '14 MAR 1935', 'Chiclayo, Lambayeque, Perú', '2010', 'Lima, Perú', 'Maestro');
  const carmen = P('Carmen', 'Díaz Paredes', 'F', '1938', 'Lima, Perú', '', '', 'Enfermera');
  const lucho = P('Luis', 'Herrera Vílchez', 'M', '1940', 'Chiclayo, Lambayeque, Perú', '', '', 'Comerciante');
  const pepe = P('José', 'Soler Roig', 'M', '1939', 'Valencia, España', '2015', 'Valencia, España', 'Ebanista');
  const pilar = P('Pilar', 'Navarro Gil', 'F', '1942', 'Petrés, Valencia, España');

  t.addChild(manuel, jorge);
  t.addParent(jorge, rosa);
  t.addSibling(jorge, lucho);
  t.addPartner(manuel, rosa, { date: '1930', place: 'Chiclayo, Perú' });
  t.addPartner(vicente, amparo, { date: '1934', place: 'Sagunto, Valencia' });
  t.addChild(vicente, pepe, amparo);
  t.addPartner(jorge, carmen, { date: '12 FEB 1960', place: 'Lima, Perú' });
  t.addPartner(pepe, pilar, { date: '1964', place: 'Valencia, España' });

  // Generación 3 (padres y tíos)
  const ricardo = t.addChild(jorge, { givenName: 'Ricardo', surname: 'Herrera Díaz', sex: 'M', birth: { date: '3 JUN 1962', place: 'Lima, Perú' }, occupation: 'Ingeniero' }, carmen);
  t.addChild(jorge, { givenName: 'Elena', surname: 'Herrera Díaz', sex: 'F', birth: { date: '1965', place: 'Lima, Perú' } }, carmen);
  t.addChild(jorge, { givenName: 'Martín', surname: 'Herrera Díaz', sex: 'M', birth: { date: '1968', place: 'Lima, Perú' } }, carmen);
  const lucia = t.addChild(pepe, { givenName: 'Lucía', surname: 'Soler Navarro', sex: 'F', birth: { date: '22 SEP 1966', place: 'Valencia, España' }, occupation: 'Profesora' }, pilar);
  t.addChild(pepe, { givenName: 'Vicente', surname: 'Soler Navarro', sex: 'M', birth: { date: '1970', place: 'Valencia, España' } }, pilar);
  t.addPartner(ricardo, lucia, { date: '1990', place: 'Valencia, España' });

  // Generación 4 (nietos)
  const daniel = t.addChild(ricardo, { givenName: 'Daniel', surname: 'Herrera Soler', sex: 'M', birth: { date: '8 JAN 1992', place: 'Valencia, España' }, occupation: 'Analista de datos', notes: 'Persona de inicio del árbol de ejemplo. Pulsa en cualquier tarjeta para ver su ficha.' }, lucia);
  t.addChild(ricardo, { givenName: 'Sara', surname: 'Herrera Soler', sex: 'F', birth: { date: '1995', place: 'Valencia, España' } }, lucia);
  const marta = P('Marta', 'Gómez Llopis', 'F', '1993', 'Castellón de la Plana, España');
  t.addPartner(daniel, marta, { date: '2019', place: 'Castellón, España' });
  t.addChild(daniel, { givenName: 'Pablo', surname: 'Herrera Gómez', sex: 'M', birth: { date: '2020', place: 'Valencia, España' } }, marta);
  t.addChild(daniel, { givenName: 'Noa', surname: 'Herrera Gómez', sex: 'F', birth: { date: '2023', place: 'Valencia, España' } }, marta);

  // Primo
  const primo = t.addChild(lucho, { givenName: 'Andrés', surname: 'Herrera Torres', sex: 'M', birth: { date: '1972', place: 'Chiclayo, Perú' } }, null);

  t.setRoot(daniel);
  return { data: t.toJSON(), rootId: daniel, ids: { manuel, rosa, jorge, lucho, ricardo, lucia, daniel, primo, pepe } };
}
