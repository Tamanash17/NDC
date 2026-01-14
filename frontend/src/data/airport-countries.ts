// Airport country mapping data
// Data source: OurAirports (https://ourairports.com/data/) - Public Domain
// This is a subset of common airports - the full list dynamically builds from Airline Profile API

export const AIRPORT_COUNTRY_MAP: Record<string, { country: string; countryName: string; city: string }> = {
  // Australia - Major Cities
  'ADL': { country: 'AU', countryName: 'Australia', city: 'Adelaide' },
  'BNE': { country: 'AU', countryName: 'Australia', city: 'Brisbane' },
  'CNS': { country: 'AU', countryName: 'Australia', city: 'Cairns' },
  'DRW': { country: 'AU', countryName: 'Australia', city: 'Darwin' },
  'HBA': { country: 'AU', countryName: 'Australia', city: 'Hobart' },

  // Melbourne Airports
  'VIZ': { country: 'AU', countryName: 'Australia', city: 'Melbourne (All Airports)' },
  'MEL': { country: 'AU', countryName: 'Australia', city: 'Melbourne Tullamarine' },
  'AVV': { country: 'AU', countryName: 'Australia', city: 'Melbourne Avalon' },

  'OOL': { country: 'AU', countryName: 'Australia', city: 'Gold Coast' },
  'PER': { country: 'AU', countryName: 'Australia', city: 'Perth' },
  'SYD': { country: 'AU', countryName: 'Australia', city: 'Sydney' },
  'CBR': { country: 'AU', countryName: 'Australia', city: 'Canberra' },

  // Australia - Queensland
  'TSV': { country: 'AU', countryName: 'Australia', city: 'Townsville' },
  'MCY': { country: 'AU', countryName: 'Australia', city: 'Sunshine Coast (Maroochydore)' },
  'PPP': { country: 'AU', countryName: 'Australia', city: 'Proserpine (Whitsunday Coast)' },
  'HTI': { country: 'AU', countryName: 'Australia', city: 'Hamilton Island' },
  'BDB': { country: 'AU', countryName: 'Australia', city: 'Bundaberg' },
  'MKY': { country: 'AU', countryName: 'Australia', city: 'Mackay' },
  'ROK': { country: 'AU', countryName: 'Australia', city: 'Rockhampton' },
  'GLT': { country: 'AU', countryName: 'Australia', city: 'Gladstone' },
  'EMD': { country: 'AU', countryName: 'Australia', city: 'Emerald' },
  'ISA': { country: 'AU', countryName: 'Australia', city: 'Mount Isa' },
  'MOV': { country: 'AU', countryName: 'Australia', city: 'Moranbah' },
  'LDC': { country: 'AU', countryName: 'Australia', city: 'Lindeman Island' },

  // Australia - New South Wales
  'CFS': { country: 'AU', countryName: 'Australia', city: 'Coffs Harbour' },
  'ABX': { country: 'AU', countryName: 'Australia', city: 'Albury' },
  'BHS': { country: 'AU', countryName: 'Australia', city: 'Bathurst' },
  'ARM': { country: 'AU', countryName: 'Australia', city: 'Armidale' },
  'DBO': { country: 'AU', countryName: 'Australia', city: 'Dubbo' },
  'WGA': { country: 'AU', countryName: 'Australia', city: 'Wagga Wagga' },
  'TMW': { country: 'AU', countryName: 'Australia', city: 'Tamworth' },
  'OAG': { country: 'AU', countryName: 'Australia', city: 'Orange' },
  'PQQ': { country: 'AU', countryName: 'Australia', city: 'Port Macquarie' },
  'NTL': { country: 'AU', countryName: 'Australia', city: 'Newcastle (Williamtown)' },
  'BHQ': { country: 'AU', countryName: 'Australia', city: 'Broken Hill' },
  'MYA': { country: 'AU', countryName: 'Australia', city: 'Moruya' },
  'MGB': { country: 'AU', countryName: 'Australia', city: 'Mount Gambier' },

  // Australia - Tasmania
  'LST': { country: 'AU', countryName: 'Australia', city: 'Launceston' },
  'BWT': { country: 'AU', countryName: 'Australia', city: 'Burnie (Wynyard)' },
  'DPO': { country: 'AU', countryName: 'Australia', city: 'Devonport' },
  'KNS': { country: 'AU', countryName: 'Australia', city: 'King Island' },

  // Australia - Northern Territory
  'ASP': { country: 'AU', countryName: 'Australia', city: 'Alice Springs' },
  'AYQ': { country: 'AU', countryName: 'Australia', city: 'Ayers Rock (Uluru)' },

  // Australia - South Australia
  'WHY': { country: 'AU', countryName: 'Australia', city: 'Whyalla' },
  'PUG': { country: 'AU', countryName: 'Australia', city: 'Port Augusta' },
  'KGC': { country: 'AU', countryName: 'Australia', city: 'Kingscote (Kangaroo Island)' },
  'CED': { country: 'AU', countryName: 'Australia', city: 'Ceduna' },

  // Australia - Victoria
  'MBW': { country: 'AU', countryName: 'Australia', city: 'Moorabbin' },
  'MQL': { country: 'AU', countryName: 'Australia', city: 'Mildura' },

  // Australia - Western Australia
  'KTA': { country: 'AU', countryName: 'Australia', city: 'Karratha' },
  'PHE': { country: 'AU', countryName: 'Australia', city: 'Port Hedland' },
  'BNK': { country: 'AU', countryName: 'Australia', city: 'Ballina (Byron Gateway)' },
  'BME': { country: 'AU', countryName: 'Australia', city: 'Broome' },
  'KNX': { country: 'AU', countryName: 'Australia', city: 'Kununurra' },
  'PBO': { country: 'AU', countryName: 'Australia', city: 'Paraburdoo' },
  'LEA': { country: 'AU', countryName: 'Australia', city: 'Learmonth (Exmouth)' },
  'KGI': { country: 'AU', countryName: 'Australia', city: 'Kalgoorlie' },
  'ALH': { country: 'AU', countryName: 'Australia', city: 'Albany' },
  'GFN': { country: 'AU', countryName: 'Australia', city: 'Grafton' },
  'GET': { country: 'AU', countryName: 'Australia', city: 'Geraldton' },
  'BUY': { country: 'AU', countryName: 'Australia', city: 'Bunbury' },
  'NRA': { country: 'AU', countryName: 'Australia', city: 'Narrandera' },

  // New Zealand
  'AKL': { country: 'NZ', countryName: 'New Zealand', city: 'Auckland' },
  'CHC': { country: 'NZ', countryName: 'New Zealand', city: 'Christchurch' },
  'WLG': { country: 'NZ', countryName: 'New Zealand', city: 'Wellington' },
  'ZQN': { country: 'NZ', countryName: 'New Zealand', city: 'Queenstown' },
  'DUD': { country: 'NZ', countryName: 'New Zealand', city: 'Dunedin' },
  'NPL': { country: 'NZ', countryName: 'New Zealand', city: 'New Plymouth' },
  'NSN': { country: 'NZ', countryName: 'New Zealand', city: 'Nelson' },
  'PMR': { country: 'NZ', countryName: 'New Zealand', city: 'Palmerston North' },
  'ROT': { country: 'NZ', countryName: 'New Zealand', city: 'Rotorua' },
  'TRG': { country: 'NZ', countryName: 'New Zealand', city: 'Tauranga' },
  'HLZ': { country: 'NZ', countryName: 'New Zealand', city: 'Hamilton' },
  'NPE': { country: 'NZ', countryName: 'New Zealand', city: 'Napier' },
  'BHE': { country: 'NZ', countryName: 'New Zealand', city: 'Blenheim' },
  'IVC': { country: 'NZ', countryName: 'New Zealand', city: 'Invercargill' },
  'GIS': { country: 'NZ', countryName: 'New Zealand', city: 'Gisborne' },

  // Indonesia
  'DPS': { country: 'ID', countryName: 'Indonesia', city: 'Bali (Denpasar)' },
  'CGK': { country: 'ID', countryName: 'Indonesia', city: 'Jakarta' },
  'SUB': { country: 'ID', countryName: 'Indonesia', city: 'Surabaya' },
  'UPG': { country: 'ID', countryName: 'Indonesia', city: 'Makassar' },
  'BTH': { country: 'ID', countryName: 'Indonesia', city: 'Batam' },
  'SRG': { country: 'ID', countryName: 'Indonesia', city: 'Semarang' },
  'SOC': { country: 'ID', countryName: 'Indonesia', city: 'Solo' },
  'JOG': { country: 'ID', countryName: 'Indonesia', city: 'Yogyakarta' },
  'MDC': { country: 'ID', countryName: 'Indonesia', city: 'Manado' },
  'PLM': { country: 'ID', countryName: 'Indonesia', city: 'Palembang' },
  'BPN': { country: 'ID', countryName: 'Indonesia', city: 'Balikpapan' },
  'PKU': { country: 'ID', countryName: 'Indonesia', city: 'Pekanbaru' },
  'BDO': { country: 'ID', countryName: 'Indonesia', city: 'Bandung' },
  'LOP': { country: 'ID', countryName: 'Indonesia', city: 'Lombok' },
  'AMI': { country: 'ID', countryName: 'Indonesia', city: 'Mataram' },
  'DJJ': { country: 'ID', countryName: 'Indonesia', city: 'Jayapura' },

  // Singapore
  'SIN': { country: 'SG', countryName: 'Singapore', city: 'Singapore' },

  // Thailand
  'BKK': { country: 'TH', countryName: 'Thailand', city: 'Bangkok' },
  'HKT': { country: 'TH', countryName: 'Thailand', city: 'Phuket' },
  'CNX': { country: 'TH', countryName: 'Thailand', city: 'Chiang Mai' },
  'USM': { country: 'TH', countryName: 'Thailand', city: 'Koh Samui' },
  'HDY': { country: 'TH', countryName: 'Thailand', city: 'Hat Yai' },
  'KBV': { country: 'TH', countryName: 'Thailand', city: 'Krabi' },
  'CEI': { country: 'TH', countryName: 'Thailand', city: 'Chiang Rai' },
  'UTP': { country: 'TH', countryName: 'Thailand', city: 'U-Tapao' },

  // Vietnam
  'SGN': { country: 'VN', countryName: 'Vietnam', city: 'Ho Chi Minh City' },
  'HAN': { country: 'VN', countryName: 'Vietnam', city: 'Hanoi' },
  'DAD': { country: 'VN', countryName: 'Vietnam', city: 'Da Nang' },
  'CXR': { country: 'VN', countryName: 'Vietnam', city: 'Nha Trang' },
  'PQC': { country: 'VN', countryName: 'Vietnam', city: 'Phu Quoc' },
  'HPH': { country: 'VN', countryName: 'Vietnam', city: 'Hai Phong' },
  'VII': { country: 'VN', countryName: 'Vietnam', city: 'Vinh' },
  'HUI': { country: 'VN', countryName: 'Vietnam', city: 'Hue' },
  'VCA': { country: 'VN', countryName: 'Vietnam', city: 'Can Tho' },
  'BMV': { country: 'VN', countryName: 'Vietnam', city: 'Buon Ma Thuot' },
  'DLI': { country: 'VN', countryName: 'Vietnam', city: 'Dalat' },
  'UIH': { country: 'VN', countryName: 'Vietnam', city: 'Qui Nhon' },
  'VDO': { country: 'VN', countryName: 'Vietnam', city: 'Van Don' },

  // Malaysia
  'KUL': { country: 'MY', countryName: 'Malaysia', city: 'Kuala Lumpur' },
  'PEN': { country: 'MY', countryName: 'Malaysia', city: 'Penang' },
  'JHB': { country: 'MY', countryName: 'Malaysia', city: 'Johor Bahru' },
  'KCH': { country: 'MY', countryName: 'Malaysia', city: 'Kuching' },
  'BKI': { country: 'MY', countryName: 'Malaysia', city: 'Kota Kinabalu' },
  'LGK': { country: 'MY', countryName: 'Malaysia', city: 'Langkawi' },
  'KBR': { country: 'MY', countryName: 'Malaysia', city: 'Kota Bharu' },
  'KUA': { country: 'MY', countryName: 'Malaysia', city: 'Kuantan' },
  'MYY': { country: 'MY', countryName: 'Malaysia', city: 'Miri' },
  'TWU': { country: 'MY', countryName: 'Malaysia', city: 'Tawau' },
  'IPH': { country: 'MY', countryName: 'Malaysia', city: 'Ipoh' },
  'BKS': { country: 'MY', countryName: 'Malaysia', city: 'Bengkalis' },
  'AOR': { country: 'MY', countryName: 'Malaysia', city: 'Alor Setar' },
  'SBW': { country: 'MY', countryName: 'Malaysia', city: 'Sibu' },
  'TGG': { country: 'MY', countryName: 'Malaysia', city: 'Kuala Terengganu' },

  // Philippines
  'MNL': { country: 'PH', countryName: 'Philippines', city: 'Manila' },
  'CEB': { country: 'PH', countryName: 'Philippines', city: 'Cebu' },
  'DVO': { country: 'PH', countryName: 'Philippines', city: 'Davao' },
  'CRK': { country: 'PH', countryName: 'Philippines', city: 'Clark' },
  'ILO': { country: 'PH', countryName: 'Philippines', city: 'Iloilo' },
  'KLO': { country: 'PH', countryName: 'Philippines', city: 'Kalibo' },
  'TAG': { country: 'PH', countryName: 'Philippines', city: 'Tagbilaran' },
  'BCD': { country: 'PH', countryName: 'Philippines', city: 'Bacolod' },
  'DGT': { country: 'PH', countryName: 'Philippines', city: 'Dumaguete' },
  'MPH': { country: 'PH', countryName: 'Philippines', city: 'Caticlan (Boracay)' },
  'PPS': { country: 'PH', countryName: 'Philippines', city: 'Puerto Princesa' },
  'GES': { country: 'PH', countryName: 'Philippines', city: 'General Santos' },
  'TAC': { country: 'PH', countryName: 'Philippines', city: 'Tacloban' },
  'CBO': { country: 'PH', countryName: 'Philippines', city: 'Cotabato' },
  'ZAM': { country: 'PH', countryName: 'Philippines', city: 'Zamboanga' },

  // Japan
  'NRT': { country: 'JP', countryName: 'Japan', city: 'Tokyo Narita' },
  'HND': { country: 'JP', countryName: 'Japan', city: 'Tokyo Haneda' },
  'KIX': { country: 'JP', countryName: 'Japan', city: 'Osaka' },
  'NGO': { country: 'JP', countryName: 'Japan', city: 'Nagoya' },
  'FUK': { country: 'JP', countryName: 'Japan', city: 'Fukuoka' },
  'CTS': { country: 'JP', countryName: 'Japan', city: 'Sapporo' },
  'OKA': { country: 'JP', countryName: 'Japan', city: 'Okinawa' },
  'HIJ': { country: 'JP', countryName: 'Japan', city: 'Hiroshima' },
  'KOJ': { country: 'JP', countryName: 'Japan', city: 'Kagoshima' },
  'SDJ': { country: 'JP', countryName: 'Japan', city: 'Sendai' },
  'OIT': { country: 'JP', countryName: 'Japan', city: 'Oita' },
  'KMJ': { country: 'JP', countryName: 'Japan', city: 'Kumamoto' },
  'MYJ': { country: 'JP', countryName: 'Japan', city: 'Matsuyama' },
  'UBJ': { country: 'JP', countryName: 'Japan', city: 'Ube' },
  'FSZ': { country: 'JP', countryName: 'Japan', city: 'Mt. Fuji Shizuoka' },
  'AKJ': { country: 'JP', countryName: 'Japan', city: 'Asahikawa' },

  // Hong Kong
  'HKG': { country: 'HK', countryName: 'Hong Kong', city: 'Hong Kong' },

  // Taiwan
  'TPE': { country: 'TW', countryName: 'Taiwan', city: 'Taipei' },
  'KHH': { country: 'TW', countryName: 'Taiwan', city: 'Kaohsiung' },
  'RMQ': { country: 'TW', countryName: 'Taiwan', city: 'Taichung' },

  // China
  'PVG': { country: 'CN', countryName: 'China', city: 'Shanghai Pudong' },
  'PEK': { country: 'CN', countryName: 'China', city: 'Beijing' },
  'CAN': { country: 'CN', countryName: 'China', city: 'Guangzhou' },
  'SZX': { country: 'CN', countryName: 'China', city: 'Shenzhen' },
  'CTU': { country: 'CN', countryName: 'China', city: 'Chengdu' },
  'XIY': { country: 'CN', countryName: 'China', city: "Xi'an" },
  'HGH': { country: 'CN', countryName: 'China', city: 'Hangzhou' },
  'NKG': { country: 'CN', countryName: 'China', city: 'Nanjing' },
  'WUH': { country: 'CN', countryName: 'China', city: 'Wuhan' },
  'CSX': { country: 'CN', countryName: 'China', city: 'Changsha' },
  'CKG': { country: 'CN', countryName: 'China', city: 'Chongqing' },
  'KMG': { country: 'CN', countryName: 'China', city: 'Kunming' },

  // South Korea
  'ICN': { country: 'KR', countryName: 'South Korea', city: 'Seoul Incheon' },
  'GMP': { country: 'KR', countryName: 'South Korea', city: 'Seoul Gimpo' },
  'PUS': { country: 'KR', countryName: 'South Korea', city: 'Busan' },
  'CJU': { country: 'KR', countryName: 'South Korea', city: 'Jeju' },

  // India
  'DEL': { country: 'IN', countryName: 'India', city: 'Delhi' },
  'BOM': { country: 'IN', countryName: 'India', city: 'Mumbai' },
  'BLR': { country: 'IN', countryName: 'India', city: 'Bangalore' },
  'MAA': { country: 'IN', countryName: 'India', city: 'Chennai' },
  'HYD': { country: 'IN', countryName: 'India', city: 'Hyderabad' },
  'CCU': { country: 'IN', countryName: 'India', city: 'Kolkata' },
  'AMD': { country: 'IN', countryName: 'India', city: 'Ahmedabad' },
  'COK': { country: 'IN', countryName: 'India', city: 'Kochi' },
  'GAU': { country: 'IN', countryName: 'India', city: 'Guwahati' },
  'TRV': { country: 'IN', countryName: 'India', city: 'Trivandrum' },

  // United Arab Emirates
  'DXB': { country: 'AE', countryName: 'UAE', city: 'Dubai' },
  'AUH': { country: 'AE', countryName: 'UAE', city: 'Abu Dhabi' },

  // Fiji
  'NAN': { country: 'FJ', countryName: 'Fiji', city: 'Nadi' },
  'SUV': { country: 'FJ', countryName: 'Fiji', city: 'Suva' },

  // New Caledonia
  'NOU': { country: 'NC', countryName: 'New Caledonia', city: 'Noumea' },

  // Cook Islands
  'RAR': { country: 'CK', countryName: 'Cook Islands', city: 'Rarotonga' },

  // Vanuatu
  'VLI': { country: 'VU', countryName: 'Vanuatu', city: 'Port Vila' },

  // Cambodia
  'PNH': { country: 'KH', countryName: 'Cambodia', city: 'Phnom Penh' },
  'REP': { country: 'KH', countryName: 'Cambodia', city: 'Siem Reap' },

  // Laos
  'VTE': { country: 'LA', countryName: 'Laos', city: 'Vientiane' },
  'LPQ': { country: 'LA', countryName: 'Laos', city: 'Luang Prabang' },

  // Myanmar
  'RGN': { country: 'MM', countryName: 'Myanmar', city: 'Yangon' },
  'MDL': { country: 'MM', countryName: 'Myanmar', city: 'Mandalay' },

  // Maldives
  'MLE': { country: 'MV', countryName: 'Maldives', city: 'Male' },

  // Sri Lanka
  'CMB': { country: 'LK', countryName: 'Sri Lanka', city: 'Colombo' },

  // Additional Chinese Cities
  'WUX': { country: 'CN', countryName: 'China', city: 'Wuxi' },
  'WNZ': { country: 'CN', countryName: 'China', city: 'Wenzhou' },
  'NAY': { country: 'CN', countryName: 'China', city: 'Beijing Nanyuan' },
  'SYX': { country: 'CN', countryName: 'China', city: 'Sanya' },
  'DLC': { country: 'CN', countryName: 'China', city: 'Dalian' },
  'TAO': { country: 'CN', countryName: 'China', city: 'Qingdao' },
  'FOC': { country: 'CN', countryName: 'China', city: 'Fuzhou' },
  'XMN': { country: 'CN', countryName: 'China', city: 'Xiamen' },
  'NNG': { country: 'CN', countryName: 'China', city: 'Nanning' },
  'SHE': { country: 'CN', countryName: 'China', city: 'Shenyang' },
  'TNA': { country: 'CN', countryName: 'China', city: 'Jinan' },
  'CGO': { country: 'CN', countryName: 'China', city: 'Zhengzhou' },
  'HRB': { country: 'CN', countryName: 'China', city: 'Harbin' },
  'URC': { country: 'CN', countryName: 'China', city: 'Urumqi' },
  'LHW': { country: 'CN', countryName: 'China', city: 'Lanzhou' },
  'INC': { country: 'CN', countryName: 'China', city: 'Yinchuan' },
  'HET': { country: 'CN', countryName: 'China', city: 'Hohhot' },
  'CGQ': { country: 'CN', countryName: 'China', city: 'Changchun' },

  // India - Additional Cities
  'NAG': { country: 'IN', countryName: 'India', city: 'Nagpur' },
  'VNS': { country: 'IN', countryName: 'India', city: 'Varanasi' },
  'IXC': { country: 'IN', countryName: 'India', city: 'Chandigarh' },
  'LKO': { country: 'IN', countryName: 'India', city: 'Lucknow' },
  'PAT': { country: 'IN', countryName: 'India', city: 'Patna' },
  'BBI': { country: 'IN', countryName: 'India', city: 'Bhubaneswar' },
  'IXB': { country: 'IN', countryName: 'India', city: 'Bagdogra' },
  'RPR': { country: 'IN', countryName: 'India', city: 'Raipur' },
  'IXR': { country: 'IN', countryName: 'India', city: 'Ranchi' },
  'IXJ': { country: 'IN', countryName: 'India', city: 'Jammu' },
  'IXL': { country: 'IN', countryName: 'India', city: 'Leh' },
  'SXR': { country: 'IN', countryName: 'India', city: 'Srinagar' },
  'IDR': { country: 'IN', countryName: 'India', city: 'Indore' },
  'VGA': { country: 'IN', countryName: 'India', city: 'Vijayawada' },
  'BDQ': { country: 'IN', countryName: 'India', city: 'Vadodara' },
  'JAI': { country: 'IN', countryName: 'India', city: 'Jaipur' },
  'UDR': { country: 'IN', countryName: 'India', city: 'Udaipur' },

  // Additional Pacific Islands (non-duplicates only)
  'PPT': { country: 'PF', countryName: 'French Polynesia', city: 'Papeete (Tahiti)' },
  'APW': { country: 'WS', countryName: 'Samoa', city: 'Apia' },
  'TBU': { country: 'TO', countryName: 'Tonga', city: 'Nuku\'alofa' },
  'FUN': { country: 'TV', countryName: 'Tuvalu', city: 'Funafuti' },
  'INU': { country: 'NR', countryName: 'Nauru', city: 'Yaren' },
  'TRW': { country: 'KI', countryName: 'Kiribati', city: 'Tarawa' },
  'SON': { country: 'PG', countryName: 'Papua New Guinea', city: 'Espiritu Santo' },
  'HNI': { country: 'PG', countryName: 'Papua New Guinea', city: 'Honiara (Solomon Islands)' },

  // Additional Myanmar
  'NYU': { country: 'MM', countryName: 'Myanmar', city: 'Nyaung U (Bagan)' },

  // Additional Malaysia
  'LBU': { country: 'MY', countryName: 'Malaysia', city: 'Labuan' },
  'SDK': { country: 'MY', countryName: 'Malaysia', city: 'Sandakan' },

  // Additional Indonesia
  'PKY': { country: 'ID', countryName: 'Indonesia', city: 'Palangkaraya' },
  'TRK': { country: 'ID', countryName: 'Indonesia', city: 'Tarakan' },
  'DJB': { country: 'ID', countryName: 'Indonesia', city: 'Jambi' },
  'KNO': { country: 'ID', countryName: 'Indonesia', city: 'Medan' },

  // Additional Thailand
  'HHQ': { country: 'TH', countryName: 'Thailand', city: 'Hua Hin' },
  'UTH': { country: 'TH', countryName: 'Thailand', city: 'Udon Thani' },
  'KKC': { country: 'TH', countryName: 'Thailand', city: 'Khon Kaen' },
  'UBP': { country: 'TH', countryName: 'Thailand', city: 'Ubon Ratchathani' },

  // Additional New Zealand
  'KKE': { country: 'NZ', countryName: 'New Zealand', city: 'Kerikeri' },
  'WSZ': { country: 'NZ', countryName: 'New Zealand', city: 'Westport' },
  'WHK': { country: 'NZ', countryName: 'New Zealand', city: 'Whakatane' },
  'WHO': { country: 'NZ', countryName: 'New Zealand', city: 'Franz Josef' },
  'WAG': { country: 'NZ', countryName: 'New Zealand', city: 'Wanganui' },
  'WKA': { country: 'NZ', countryName: 'New Zealand', city: 'Wanaka' },
  'WRE': { country: 'NZ', countryName: 'New Zealand', city: 'Whangarei' },
  'WSC': { country: 'NZ', countryName: 'New Zealand', city: 'Somerfield (Christchurch)' },
  'WSI': { country: 'NZ', countryName: 'New Zealand', city: 'Waiouru' },
  'WSY': { country: 'NZ', countryName: 'New Zealand', city: 'Whitsunday' },

  // Additional International Airports
  'BPE': { country: 'CN', countryName: 'China', city: 'Qinhuangdao Beidaihe' },
  'BQB': { country: 'IN', countryName: 'India', city: 'Busselton' },
  'DAT': { country: 'CN', countryName: 'China', city: 'Datong' },
  'DDI': { country: 'AU', countryName: 'Australia', city: 'Daydream Island' },
  'DIA': { country: 'AU', countryName: 'Australia', city: 'Diamantina Lakes' },

  // Additional Australian Regional
  'BMO': { country: 'AU', countryName: 'Australia', city: 'Bhamo' },

  // Additional Chinese Cities
  'CGD': { country: 'CN', countryName: 'China', city: 'Changde' },
  'JHG': { country: 'CN', countryName: 'China', city: 'Xishuangbanna Gasa' },
  'JIU': { country: 'CN', countryName: 'China', city: 'Jiujiang Lushan' },
  'LYG': { country: 'CN', countryName: 'China', city: 'Lianyungang' },
  'YNZ': { country: 'CN', countryName: 'China', city: 'Yancheng' },

  // Additional Japanese Cities (Osaka Itami only - others exist above)
  'ITM': { country: 'JP', countryName: 'Japan', city: 'Osaka Itami' },
};


// In-memory cache for dynamically fetched airports
const airportCache = new Map<string, { country: string; countryName: string; city: string }>();

/**
 * Get airport information from local database or cache
 * For unknown airports, returns a fallback with the IATA code as the city name
 */
export function getAirportInfo(iataCode: string) {
  // Check local database first
  if (AIRPORT_COUNTRY_MAP[iataCode]) {
    return AIRPORT_COUNTRY_MAP[iataCode];
  }

  // Check cache
  if (airportCache.has(iataCode)) {
    return airportCache.get(iataCode)!;
  }

  // Return fallback - just show the code
  return {
    country: '',
    countryName: 'Unknown',
    city: iataCode
  };
}

/**
 * Fetch airport information from a public API (like AviationStack or similar)
 * This is async and can be called in the background to populate the cache
 */
export async function fetchAirportInfo(iataCode: string): Promise<{ country: string; countryName: string; city: string } | null> {
  try {
    // Option 1: Use a free public API like AviationStack (requires API key)
    // Option 2: Use airport-data npm package (client-side not ideal)
    // Option 3: Create a backend endpoint that serves airport data

    // For now, we'll add airports to a "to be researched" list
    console.log(`Airport ${iataCode} needs to be added to the database`);
    return null;
  } catch (error) {
    console.error(`Failed to fetch airport info for ${iataCode}:`, error);
    return null;
  }
}

/**
 * Get all unknown airport codes from a list
 * Useful for identifying which airports need to be added to the database
 */
export function getUnknownAirports(airportCodes: string[]): string[] {
  return airportCodes.filter(code =>
    !AIRPORT_COUNTRY_MAP[code] && !airportCache.has(code)
  );
}

/**
 * Log unknown airports to console for easy identification
 */
export function logUnknownAirports(airportCodes: string[]): void {
  const unknown = getUnknownAirports(airportCodes);
  if (unknown.length > 0) {
    console.group('🔍 Unknown Airports Found');
    console.log(`Total: ${unknown.length} airports need to be added`);
    console.log('Codes:', unknown.sort().join(', '));
    console.groupEnd();
  }
}

// Helper function to sort airports: Australia first, then by country name, then by city
export function sortAirportsByCountry(airports: Array<{ code: string; label: string; value: string; country: string }>) {
  return airports.sort((a, b) => {
    const aInfo = getAirportInfo(a.code);
    const bInfo = getAirportInfo(b.code);

    // Australia first
    if (aInfo.country === 'AU' && bInfo.country !== 'AU') return -1;
    if (aInfo.country !== 'AU' && bInfo.country === 'AU') return 1;

    // Then by country name
    if (aInfo.countryName !== bInfo.countryName) {
      return aInfo.countryName.localeCompare(bInfo.countryName);
    }

    // Then by city
    return aInfo.city.localeCompare(bInfo.city);
  });
}
