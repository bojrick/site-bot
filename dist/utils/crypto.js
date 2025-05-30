"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOTP = generateOTP;
exports.hashOTP = hashOTP;
exports.verifyOTP = verifyOTP;
exports.getOTPExpiry = getOTPExpiry;
exports.isOTPExpired = isOTPExpired;
const bcrypt_1 = __importDefault(require("bcrypt"));
const SALT_ROUNDS = 10;
// Generate a 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// Hash OTP for secure storage
async function hashOTP(otp) {
    return bcrypt_1.default.hash(otp, SALT_ROUNDS);
}
// Verify OTP against hash
async function verifyOTP(otp, hash) {
    return bcrypt_1.default.compare(otp, hash);
}
// Generate OTP expiry time (default 10 minutes)
function getOTPExpiry(minutes = 10) {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + minutes);
    return expiry;
}
// Check if OTP has expired
function isOTPExpired(expiryTime) {
    return new Date() > expiryTime;
}
//# sourceMappingURL=crypto.js.map