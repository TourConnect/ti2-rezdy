const COUNTRIES = [
  {
    isoCode: 'AF',
    title: 'Afghanistan',
  },
  {
    isoCode: 'AL',
    title: 'Albania',
  },
  {
    isoCode: 'DZ',
    title: 'Algeria',
  },
  {
    isoCode: 'AS',
    title: 'American Samoa',
  },
  {
    isoCode: 'AD',
    title: 'Andorra',
  },
  {
    isoCode: 'AO',
    title: 'Angola',
  },
  {
    isoCode: 'AI',
    title: 'Anguilla',
  },
  {
    isoCode: 'AQ',
    title: 'Antarctica',
  },
  {
    isoCode: 'AG',
    title: 'Antigua & Barbuda',
  },
  {
    isoCode: 'AR',
    title: 'Argentina',
  },
  {
    isoCode: 'AM',
    title: 'Armenia',
  },
  {
    isoCode: 'AW',
    title: 'Aruba',
  },
  {
    isoCode: 'AU',
    title: 'Australia',
  },
  {
    isoCode: 'AT',
    title: 'Austria',
  },
  {
    isoCode: 'AZ',
    title: 'Azerbaijan',
  },
  {
    isoCode: 'BS',
    title: 'Bahamas',
  },
  {
    isoCode: 'BH',
    title: 'Bahrain',
  },
  {
    isoCode: 'BD',
    title: 'Bangladesh',
  },
  {
    isoCode: 'BB',
    title: 'Barbados',
  },
  {
    isoCode: 'BY',
    title: 'Belarus',
  },
  {
    isoCode: 'BE',
    title: 'Belgium',
  },
  {
    isoCode: 'BZ',
    title: 'Belize',
  },
  {
    isoCode: 'BJ',
    title: 'Benin',
  },
  {
    isoCode: 'BM',
    title: 'Bermuda',
  },
  {
    isoCode: 'BT',
    title: 'Bhutan',
  },
  {
    isoCode: 'BO',
    title: 'Bolivia',
  },
  {
    isoCode: 'BA',
    title: 'Bosnia & Herzegovina',
  },
  {
    isoCode: 'BW',
    title: 'Botswana',
  },
  {
    isoCode: 'BV',
    title: 'Bouvet Island',
  },
  {
    isoCode: 'BR',
    title: 'Brazil',
  },
  {
    isoCode: 'IO',
    title: 'British Indian Ocean Territory',
  },
  {
    isoCode: 'VG',
    title: 'British Virgin Islands',
  },
  {
    isoCode: 'BN',
    title: 'Brunei',
  },
  {
    isoCode: 'BG',
    title: 'Bulgaria',
  },
  {
    isoCode: 'BF',
    title: 'Burkina Faso',
  },
  {
    isoCode: 'BI',
    title: 'Burundi',
  },
  {
    isoCode: 'KH',
    title: 'Cambodia',
  },
  {
    isoCode: 'CM',
    title: 'Cameroon',
  },
  {
    isoCode: 'CA',
    title: 'Canada',
  },
  {
    isoCode: 'CV',
    title: 'Cape Verde',
  },
  {
    isoCode: 'BQ',
    title: 'Caribbean Netherlands',
  },
  {
    isoCode: 'KY',
    title: 'Cayman Islands',
  },
  {
    isoCode: 'CF',
    title: 'Central African Republic',
  },
  {
    isoCode: 'TD',
    title: 'Chad',
  },
  {
    isoCode: 'CL',
    title: 'Chile',
  },
  {
    isoCode: 'CN',
    title: 'China',
  },
  {
    isoCode: 'CX',
    title: 'Christmas Island',
  },
  {
    isoCode: 'CC',
    title: 'Cocos (Keeling) Islands',
  },
  {
    isoCode: 'CO',
    title: 'Colombia',
  },
  {
    isoCode: 'KM',
    title: 'Comoros',
  },
  {
    isoCode: 'CG',
    title: 'Congo - Brazzaville',
  },
  {
    isoCode: 'CD',
    title: 'Congo - Kinshasa',
  },
  {
    isoCode: 'CK',
    title: 'Cook Islands',
  },
  {
    isoCode: 'CR',
    title: 'Costa Rica',
  },
  {
    isoCode: 'HR',
    title: 'Croatia',
  },
  {
    isoCode: 'CU',
    title: 'Cuba',
  },
  {
    isoCode: 'CW',
    title: 'Curaçao',
  },
  {
    isoCode: 'CY',
    title: 'Cyprus',
  },
  {
    isoCode: 'CZ',
    title: 'Czechia',
  },
  {
    isoCode: 'CI',
    title: 'Côte d’Ivoire',
  },
  {
    isoCode: 'DK',
    title: 'Denmark',
  },
  {
    isoCode: 'DJ',
    title: 'Djibouti',
  },
  {
    isoCode: 'DM',
    title: 'Dominica',
  },
  {
    isoCode: 'DO',
    title: 'Dominican Republic',
  },
  {
    isoCode: 'EC',
    title: 'Ecuador',
  },
  {
    isoCode: 'EG',
    title: 'Egypt',
  },
  {
    isoCode: 'SV',
    title: 'El Salvador',
  },
  {
    isoCode: 'GQ',
    title: 'Equatorial Guinea',
  },
  {
    isoCode: 'ER',
    title: 'Eritrea',
  },
  {
    isoCode: 'EE',
    title: 'Estonia',
  },
  {
    isoCode: 'SZ',
    title: 'Eswatini',
  },
  {
    isoCode: 'ET',
    title: 'Ethiopia',
  },
  {
    isoCode: 'FK',
    title: 'Falkland Islands',
  },
  {
    isoCode: 'FO',
    title: 'Faroe Islands',
  },
  {
    isoCode: 'FJ',
    title: 'Fiji',
  },
  {
    isoCode: 'FI',
    title: 'Finland',
  },
  {
    isoCode: 'FR',
    title: 'France',
  },
  {
    isoCode: 'GF',
    title: 'French Guiana',
  },
  {
    isoCode: 'PF',
    title: 'French Polynesia',
  },
  {
    isoCode: 'TF',
    title: 'French Southern Territories',
  },
  {
    isoCode: 'GA',
    title: 'Gabon',
  },
  {
    isoCode: 'GM',
    title: 'Gambia',
  },
  {
    isoCode: 'GE',
    title: 'Georgia',
  },
  {
    isoCode: 'DE',
    title: 'Germany',
  },
  {
    isoCode: 'GH',
    title: 'Ghana',
  },
  {
    isoCode: 'GI',
    title: 'Gibraltar',
  },
  {
    isoCode: 'GR',
    title: 'Greece',
  },
  {
    isoCode: 'GL',
    title: 'Greenland',
  },
  {
    isoCode: 'GD',
    title: 'Grenada',
  },
  {
    isoCode: 'GP',
    title: 'Guadeloupe',
  },
  {
    isoCode: 'GU',
    title: 'Guam',
  },
  {
    isoCode: 'GT',
    title: 'Guatemala',
  },
  {
    isoCode: 'GG',
    title: 'Guernsey',
  },
  {
    isoCode: 'GN',
    title: 'Guinea',
  },
  {
    isoCode: 'GW',
    title: 'Guinea-Bissau',
  },
  {
    isoCode: 'GY',
    title: 'Guyana',
  },
  {
    isoCode: 'HT',
    title: 'Haiti',
  },
  {
    isoCode: 'HM',
    title: 'Heard & McDonald Islands',
  },
  {
    isoCode: 'HN',
    title: 'Honduras',
  },
  {
    isoCode: 'HK',
    title: 'Hong Kong SAR China',
  },
  {
    isoCode: 'HU',
    title: 'Hungary',
  },
  {
    isoCode: 'IS',
    title: 'Iceland',
  },
  {
    isoCode: 'IN',
    title: 'India',
  },
  {
    isoCode: 'ID',
    title: 'Indonesia',
  },
  {
    isoCode: 'IR',
    title: 'Iran',
  },
  {
    isoCode: 'IQ',
    title: 'Iraq',
  },
  {
    isoCode: 'IE',
    title: 'Ireland',
  },
  {
    isoCode: 'IM',
    title: 'Isle of Man',
  },
  {
    isoCode: 'IL',
    title: 'Israel',
  },
  {
    isoCode: 'IT',
    title: 'Italy',
  },
  {
    isoCode: 'JM',
    title: 'Jamaica',
  },
  {
    isoCode: 'JP',
    title: 'Japan',
  },
  {
    isoCode: 'JE',
    title: 'Jersey',
  },
  {
    isoCode: 'JO',
    title: 'Jordan',
  },
  {
    isoCode: 'KZ',
    title: 'Kazakhstan',
  },
  {
    isoCode: 'KE',
    title: 'Kenya',
  },
  {
    isoCode: 'KI',
    title: 'Kiribati',
  },
  {
    isoCode: 'KW',
    title: 'Kuwait',
  },
  {
    isoCode: 'KG',
    title: 'Kyrgyzstan',
  },
  {
    isoCode: 'LA',
    title: 'Laos',
  },
  {
    isoCode: 'LV',
    title: 'Latvia',
  },
  {
    isoCode: 'LB',
    title: 'Lebanon',
  },
  {
    isoCode: 'LS',
    title: 'Lesotho',
  },
  {
    isoCode: 'LR',
    title: 'Liberia',
  },
  {
    isoCode: 'LY',
    title: 'Libya',
  },
  {
    isoCode: 'LI',
    title: 'Liechtenstein',
  },
  {
    isoCode: 'LT',
    title: 'Lithuania',
  },
  {
    isoCode: 'LU',
    title: 'Luxembourg',
  },
  {
    isoCode: 'MO',
    title: 'Macao SAR China',
  },
  {
    isoCode: 'MG',
    title: 'Madagascar',
  },
  {
    isoCode: 'MW',
    title: 'Malawi',
  },
  {
    isoCode: 'MY',
    title: 'Malaysia',
  },
  {
    isoCode: 'MV',
    title: 'Maldives',
  },
  {
    isoCode: 'ML',
    title: 'Mali',
  },
  {
    isoCode: 'MT',
    title: 'Malta',
  },
  {
    isoCode: 'MH',
    title: 'Marshall Islands',
  },
  {
    isoCode: 'MQ',
    title: 'Martinique',
  },
  {
    isoCode: 'MR',
    title: 'Mauritania',
  },
  {
    isoCode: 'MU',
    title: 'Mauritius',
  },
  {
    isoCode: 'YT',
    title: 'Mayotte',
  },
  {
    isoCode: 'MX',
    title: 'Mexico',
  },
  {
    isoCode: 'FM',
    title: 'Micronesia',
  },
  {
    isoCode: 'MD',
    title: 'Moldova',
  },
  {
    isoCode: 'MC',
    title: 'Monaco',
  },
  {
    isoCode: 'MN',
    title: 'Mongolia',
  },
  {
    isoCode: 'ME',
    title: 'Montenegro',
  },
  {
    isoCode: 'MS',
    title: 'Montserrat',
  },
  {
    isoCode: 'MA',
    title: 'Morocco',
  },
  {
    isoCode: 'MZ',
    title: 'Mozambique',
  },
  {
    isoCode: 'MM',
    title: 'Myanmar (Burma)',
  },
  {
    isoCode: 'NA',
    title: 'Namibia',
  },
  {
    isoCode: 'NR',
    title: 'Nauru',
  },
  {
    isoCode: 'NP',
    title: 'Nepal',
  },
  {
    isoCode: 'NL',
    title: 'Netherlands',
  },
  {
    isoCode: 'NC',
    title: 'New Caledonia',
  },
  {
    isoCode: 'NZ',
    title: 'New Zealand',
  },
  {
    isoCode: 'NI',
    title: 'Nicaragua',
  },
  {
    isoCode: 'NE',
    title: 'Niger',
  },
  {
    isoCode: 'NG',
    title: 'Nigeria',
  },
  {
    isoCode: 'NU',
    title: 'Niue',
  },
  {
    isoCode: 'NF',
    title: 'Norfolk Island',
  },
  {
    isoCode: 'KP',
    title: 'North Korea',
  },
  {
    isoCode: 'MK',
    title: 'North Macedonia',
  },
  {
    isoCode: 'MP',
    title: 'Northern Mariana Islands',
  },
  {
    isoCode: 'NO',
    title: 'Norway',
  },
  {
    isoCode: 'OM',
    title: 'Oman',
  },
  {
    isoCode: 'PK',
    title: 'Pakistan',
  },
  {
    isoCode: 'PW',
    title: 'Palau',
  },
  {
    isoCode: 'PS',
    title: 'Palestinian Territories',
  },
  {
    isoCode: 'PA',
    title: 'Panama',
  },
  {
    isoCode: 'PG',
    title: 'Papua New Guinea',
  },
  {
    isoCode: 'PY',
    title: 'Paraguay',
  },
  {
    isoCode: 'PE',
    title: 'Peru',
  },
  {
    isoCode: 'PH',
    title: 'Philippines',
  },
  {
    isoCode: 'PN',
    title: 'Pitcairn Islands',
  },
  {
    isoCode: 'PL',
    title: 'Poland',
  },
  {
    isoCode: 'PT',
    title: 'Portugal',
  },
  {
    isoCode: 'PR',
    title: 'Puerto Rico',
  },
  {
    isoCode: 'QA',
    title: 'Qatar',
  },
  {
    isoCode: 'RO',
    title: 'Romania',
  },
  {
    isoCode: 'RU',
    title: 'Russia',
  },
  {
    isoCode: 'RW',
    title: 'Rwanda',
  },
  {
    isoCode: 'RE',
    title: 'Réunion',
  },
  {
    isoCode: 'WS',
    title: 'Samoa',
  },
  {
    isoCode: 'SM',
    title: 'San Marino',
  },
  {
    isoCode: 'SA',
    title: 'Saudi Arabia',
  },
  {
    isoCode: 'SN',
    title: 'Senegal',
  },
  {
    isoCode: 'RS',
    title: 'Serbia',
  },
  {
    isoCode: 'SC',
    title: 'Seychelles',
  },
  {
    isoCode: 'SL',
    title: 'Sierra Leone',
  },
  {
    isoCode: 'SG',
    title: 'Singapore',
  },
  {
    isoCode: 'SX',
    title: 'Sint Maarten',
  },
  {
    isoCode: 'SK',
    title: 'Slovakia',
  },
  {
    isoCode: 'SI',
    title: 'Slovenia',
  },
  {
    isoCode: 'SB',
    title: 'Solomon Islands',
  },
  {
    isoCode: 'SO',
    title: 'Somalia',
  },
  {
    isoCode: 'ZA',
    title: 'South Africa',
  },
  {
    isoCode: 'GS',
    title: 'South Georgia & South Sandwich Islands',
  },
  {
    isoCode: 'KR',
    title: 'South Korea',
  },
  {
    isoCode: 'SS',
    title: 'South Sudan',
  },
  {
    isoCode: 'ES',
    title: 'Spain',
  },
  {
    isoCode: 'LK',
    title: 'Sri Lanka',
  },
  {
    isoCode: 'BL',
    title: 'St. Barthélemy',
  },
  {
    isoCode: 'SH',
    title: 'St. Helena',
  },
  {
    isoCode: 'KN',
    title: 'St. Kitts & Nevis',
  },
  {
    isoCode: 'LC',
    title: 'St. Lucia',
  },
  {
    isoCode: 'MF',
    title: 'St. Martin',
  },
  {
    isoCode: 'PM',
    title: 'St. Pierre & Miquelon',
  },
  {
    isoCode: 'VC',
    title: 'St. Vincent & Grenadines',
  },
  {
    isoCode: 'SD',
    title: 'Sudan',
  },
  {
    isoCode: 'SR',
    title: 'Suriname',
  },
  {
    isoCode: 'SJ',
    title: 'Svalbard & Jan Mayen',
  },
  {
    isoCode: 'SE',
    title: 'Sweden',
  },
  {
    isoCode: 'CH',
    title: 'Switzerland',
  },
  {
    isoCode: 'SY',
    title: 'Syria',
  },
  {
    isoCode: 'ST',
    title: 'São Tomé & Príncipe',
  },
  {
    isoCode: 'TW',
    title: 'Taiwan',
  },
  {
    isoCode: 'TJ',
    title: 'Tajikistan',
  },
  {
    isoCode: 'TZ',
    title: 'Tanzania',
  },
  {
    isoCode: 'TH',
    title: 'Thailand',
  },
  {
    isoCode: 'TL',
    title: 'Timor-Leste',
  },
  {
    isoCode: 'TG',
    title: 'Togo',
  },
  {
    isoCode: 'TK',
    title: 'Tokelau',
  },
  {
    isoCode: 'TO',
    title: 'Tonga',
  },
  {
    isoCode: 'TT',
    title: 'Trinidad & Tobago',
  },
  {
    isoCode: 'TN',
    title: 'Tunisia',
  },
  {
    isoCode: 'TR',
    title: 'Turkey',
  },
  {
    isoCode: 'TM',
    title: 'Turkmenistan',
  },
  {
    isoCode: 'TC',
    title: 'Turks & Caicos Islands',
  },
  {
    isoCode: 'TV',
    title: 'Tuvalu',
  },
  {
    isoCode: 'UM',
    title: 'U.S. Outlying Islands',
  },
  {
    isoCode: 'VI',
    title: 'U.S. Virgin Islands',
  },
  {
    isoCode: 'UG',
    title: 'Uganda',
  },
  {
    isoCode: 'UA',
    title: 'Ukraine',
  },
  {
    isoCode: 'AE',
    title: 'United Arab Emirates',
  },
  {
    isoCode: 'GB',
    title: 'United Kingdom',
  },
  {
    isoCode: 'US',
    title: 'United States',
  },
  {
    isoCode: 'UY',
    title: 'Uruguay',
  },
  {
    isoCode: 'UZ',
    title: 'Uzbekistan',
  },
  {
    isoCode: 'VU',
    title: 'Vanuatu',
  },
  {
    isoCode: 'VA',
    title: 'Vatican City',
  },
  {
    isoCode: 'VE',
    title: 'Venezuela',
  },
  {
    isoCode: 'VN',
    title: 'Vietnam',
  },
  {
    isoCode: 'WF',
    title: 'Wallis & Futuna',
  },
  {
    isoCode: 'EH',
    title: 'Western Sahara',
  },
  {
    isoCode: 'YE',
    title: 'Yemen',
  },
  {
    isoCode: 'ZM',
    title: 'Zambia',
  },
  {
    isoCode: 'ZW',
    title: 'Zimbabwe',
  },
  {
    isoCode: 'AX',
    title: 'Åland Islands',
  },
];

const FALLBACK_COUNTRY_NAME_BY_CODE = COUNTRIES.reduce((acc, country) => ({
  ...acc,
  [country.isoCode]: country.title,
}), {});

const normalizeCode = (code, { lowercase = false } = {}) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return lowercase ? normalized.toLowerCase() : normalized;
};

const getRegionCodes = () => {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('region')
        .map(code => String(code || '').toUpperCase())
        .filter(code => /^[A-Z]{2}$/.test(code));
    } catch (_) {
      // Fall through to the fallback list below.
    }
  }
  return Object.keys(FALLBACK_COUNTRY_NAME_BY_CODE);
};

const getDisplayNameForCode = ({ code, locale = 'en' }) => {
  if (typeof Intl.DisplayNames === 'function') {
    try {
      const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
      const label = displayNames.of(code);
      if (label && label !== code) return label;
    } catch (_) {
      // Fall through to fallback names.
    }
  }
  return FALLBACK_COUNTRY_NAME_BY_CODE[code] || null;
};

const getIso31661Alpha2Countries = ({ locale = 'en', lowercase = false } = {}) => {
  const countries = getRegionCodes()
    .map((rawCode) => {
      const code = normalizeCode(rawCode, { lowercase });
      if (!code) return null;
      const label = getDisplayNameForCode({ code: code.toUpperCase(), locale });
      if (!label) return null;
      return { label, value: code };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));

  return countries;
};

const toIso31661Alpha2Code = (countryName, { locale = 'en', lowercase = false } = {}) => {
  const normalizedCountryName = String(countryName || '').trim().toLowerCase();
  if (!normalizedCountryName) return null;
  const match = getIso31661Alpha2Countries({ locale, lowercase })
    .find(country => country.label.toLowerCase() === normalizedCountryName);
  return match ? match.value : null;
};

module.exports = {
  getIso31661Alpha2Countries,
  toIso31661Alpha2Code,
};
