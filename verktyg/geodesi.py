"""Koordinattransformation SWEREF 99 (TM och lokala zoner) <-> WGS84 utan externa beroenden.

Gauss–Krügers formler enligt Lantmäteriets beskrivning av Gauss konforma projektion
(GRS 80, a = 6 378 137 m, f = 1/298,257222101). Används av importverktygen för NVDB och
kommunala trafikmätningar, som ofta levereras i SWEREF 99 TM (EPSG:3006).
"""
from __future__ import annotations

import math

A_AXIS = 6378137.0
FLATTENING = 1/298.257222101
# EPSG-kod -> (centralmeridian, skalfaktor, falsk östlig koordinat)
ZONES = {
    3006: (15.0, 0.9996, 500000.0),      # SWEREF 99 TM
    3007: (12.0, 1.0, 150000.0),         # SWEREF 99 12 00
    3008: (13.5, 1.0, 150000.0),         # SWEREF 99 13 30
    3009: (15.0, 1.0, 150000.0),         # SWEREF 99 15 00
    3011: (18.0, 1.0, 150000.0),         # SWEREF 99 18 00
    3012: (14.25, 1.0, 150000.0),        # SWEREF 99 14 15
    3013: (15.75, 1.0, 150000.0),        # SWEREF 99 15 45
    3014: (17.25, 1.0, 150000.0),        # SWEREF 99 17 15
    3010: (16.5, 1.0, 150000.0),         # SWEREF 99 16 30
}


def _constants():
    f = FLATTENING
    e2 = f*(2-f)
    n = f/(2-f)
    a_hat = A_AXIS/(1+n)*(1+n**2/4+n**4/64)
    return e2, n, a_hat


def wgs84_to_sweref(lat, lon, epsg=3006):
    lon0, k0, fe = ZONES[epsg]
    e2, n, a_hat = _constants()
    A = e2
    B = (5*e2**2-e2**3)/6
    C = (104*e2**3-45*e2**4)/120
    D = 1237*e2**4/1260
    phi, lam = math.radians(lat), math.radians(lon)
    s = math.sin(phi)
    phi_s = phi-s*math.cos(phi)*(A+B*s**2+C*s**4+D*s**6)
    dl = lam-math.radians(lon0)
    xi = math.atan(math.tan(phi_s)/math.cos(dl))
    eta = math.atanh(math.cos(phi_s)*math.sin(dl))
    b = (n/2-2*n**2/3+5*n**3/16+41*n**4/180, 13*n**2/48-3*n**3/5+557*n**4/1440,
         61*n**3/240-103*n**4/140, 49561*n**4/161280)
    north = k0*a_hat*(xi+sum(bk*math.sin(2*(k+1)*xi)*math.cosh(2*(k+1)*eta) for k, bk in enumerate(b)))
    east = k0*a_hat*(eta+sum(bk*math.cos(2*(k+1)*xi)*math.sinh(2*(k+1)*eta) for k, bk in enumerate(b)))+fe
    return north, east


def sweref_to_wgs84(north, east, epsg=3006):
    lon0, k0, fe = ZONES[epsg]
    e2, n, a_hat = _constants()
    xi = north/(k0*a_hat)
    eta = (east-fe)/(k0*a_hat)
    d = (n/2-2*n**2/3+37*n**3/96-n**4/360, n**2/48+n**3/15-437*n**4/1440,
         17*n**3/480-37*n**4/840, 4397*n**4/161280)
    xi_p = xi-sum(dk*math.sin(2*(k+1)*xi)*math.cosh(2*(k+1)*eta) for k, dk in enumerate(d))
    eta_p = eta-sum(dk*math.cos(2*(k+1)*xi)*math.sinh(2*(k+1)*eta) for k, dk in enumerate(d))
    phi_s = math.asin(math.sin(xi_p)/math.cosh(eta_p))
    dl = math.atan(math.sinh(eta_p)/math.cos(xi_p))
    A = e2+e2**2+e2**3+e2**4
    B = -(7*e2**2+17*e2**3+30*e2**4)/6
    C = (224*e2**3+889*e2**4)/120
    D = -4279*e2**4/1260
    s = math.sin(phi_s)
    phi = phi_s+s*math.cos(phi_s)*(A+B*s**2+C*s**4+D*s**6)
    return math.degrees(phi), lon0+math.degrees(dl)


def to_wgs84(x, y, epsg):
    """Returnera (lon, lat). EPSG 4326 förutsätter GeoJSON-ordning (lon, lat); SWEREF (E, N)."""
    if epsg in (4326, None):
        return x, y
    if epsg not in ZONES:
        raise ValueError('Koordinatsystem EPSG:'+str(epsg)+' stöds inte. Använd WGS84 eller SWEREF 99.')
    lat, lon = sweref_to_wgs84(y, x, epsg)
    return lon, lat


def meters(a, b):
    """Avstånd i meter mellan två (lon, lat)-punkter, lokal ekvirektangulär approximation."""
    lat = math.radians((a[1]+b[1])/2)
    dx = math.radians(b[0]-a[0])*math.cos(lat)*6371008.8
    dy = math.radians(b[1]-a[1])*6371008.8
    return math.hypot(dx, dy)
