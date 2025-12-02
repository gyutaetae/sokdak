// E2EE 암호화 유틸리티
// ECDH 키 교환 및 AES-GCM 암호화 사용

class CryptoUtils {
    constructor() {
        this.algorithm = {
            name: 'ECDH',
            namedCurve: 'P-256'
        };
        this.encryptionAlgorithm = {
            name: 'AES-GCM',
            length: 256
        };
        this.keyPair = null;
        this.sharedKeys = new Map(); // { peerId: CryptoKey }
    }

    // 키 쌍 생성
    async generateKeyPair() {
        try {
            this.keyPair = await crypto.subtle.generateKey(
                this.algorithm,
                true, // extractable
                ['deriveKey', 'deriveBits']
            );
            return this.keyPair;
        } catch (error) {
            console.error('Error generating key pair:', error);
            throw error;
        }
    }

    // 공개 키 내보내기 (다른 사용자에게 전송)
    async exportPublicKey() {
        if (!this.keyPair) {
            await this.generateKeyPair();
        }
        
        try {
            const publicKey = await crypto.subtle.exportKey(
                'jwk',
                this.keyPair.publicKey
            );
            return publicKey;
        } catch (error) {
            console.error('Error exporting public key:', error);
            throw error;
        }
    }

    // 다른 사용자의 공개 키로부터 공유 키 생성
    async deriveSharedKey(peerId, peerPublicKeyJwk) {
        try {
            // JWK를 CryptoKey로 변환
            const peerPublicKey = await crypto.subtle.importKey(
                'jwk',
                peerPublicKeyJwk,
                this.algorithm,
                false,
                []
            );

            // 공유 키 생성
            const sharedKey = await crypto.subtle.deriveKey(
                {
                    name: 'ECDH',
                    public: peerPublicKey
                },
                this.keyPair.privateKey,
                {
                    name: 'AES-GCM',
                    length: 256
                },
                false,
                ['encrypt', 'decrypt']
            );

            // 공유 키 저장
            this.sharedKeys.set(peerId, sharedKey);
            console.log(`✅ Shared key derived for peer: ${peerId}`);
            return sharedKey;
        } catch (error) {
            console.error(`Error deriving shared key for ${peerId}:`, error);
            throw error;
        }
    }

    // 메시지 암호화
    async encryptMessage(peerId, message) {
        const sharedKey = this.sharedKeys.get(peerId);
        
        if (!sharedKey) {
            throw new Error(`No shared key found for peer: ${peerId}`);
        }

        try {
            // 메시지를 Uint8Array로 변환
            const encoder = new TextEncoder();
            const messageData = encoder.encode(message);

            // IV(Initialization Vector) 생성 (12 bytes for GCM)
            const iv = crypto.getRandomValues(new Uint8Array(12));

            // 암호화
            const encryptedData = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                sharedKey,
                messageData
            );

            // IV와 암호화된 데이터를 결합하여 전송
            const combined = new Uint8Array(iv.length + encryptedData.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encryptedData), iv.length);

            // Base64로 인코딩하여 전송
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error(`Error encrypting message for ${peerId}:`, error);
            throw error;
        }
    }

    // 메시지 복호화
    async decryptMessage(peerId, encryptedMessageBase64) {
        const sharedKey = this.sharedKeys.get(peerId);
        
        if (!sharedKey) {
            throw new Error(`No shared key found for peer: ${peerId}`);
        }

        try {
            // Base64 디코딩
            const combined = Uint8Array.from(
                atob(encryptedMessageBase64),
                c => c.charCodeAt(0)
            );

            // IV와 암호화된 데이터 분리
            const iv = combined.slice(0, 12);
            const encryptedData = combined.slice(12);

            // 복호화
            const decryptedData = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                sharedKey,
                encryptedData
            );

            // Uint8Array를 문자열로 변환
            const decoder = new TextDecoder();
            return decoder.decode(decryptedData);
        } catch (error) {
            console.error(`Error decrypting message from ${peerId}:`, error);
            throw error;
        }
    }

    // 공유 키 삭제 (피어 연결 종료 시)
    removeSharedKey(peerId) {
        this.sharedKeys.delete(peerId);
        console.log(`Removed shared key for peer: ${peerId}`);
    }

    // 모든 공유 키 삭제
    clearAllKeys() {
        this.sharedKeys.clear();
        this.keyPair = null;
        console.log('All keys cleared');
    }
}

// 싱글톤 인스턴스
const cryptoUtils = new CryptoUtils();

// 모듈 내보내기 (브라우저 환경)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = cryptoUtils;
} else {
    window.cryptoUtils = cryptoUtils;
}

